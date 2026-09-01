/* rememberwhen auth-spike — issue #17.
   Draait op één origin, volledig same-origin, achter een `.htaccess` met
   `AuthType Basic` op Web Station's Apache-back-end. De vraag is niet of de
   pagina laadt — dat je hem ziet, bewijst dat al — maar of de subresources
   het credential meedragen, en of falen zichtbaar is.

   Alle URL's zijn relatief, zodat de map kan verhuizen zonder code-wijziging. */

const OPEN_PATH = '/spike/media/canary.txt'; // de open map van #5: moet zonder drempel blijven
const REALM2 = './realm2/';                  // tweede drempel, ander realm, credential dat niemand heeft

const RUN = Math.random().toString(36).slice(2, 8);
let bustN = 0;
const bust = (u) => u + (u.includes('?') ? '&' : '?') + 'r=' + RUN + '-' + ++bustN;

const $ = (id) => document.getElementById(id);
const stage = () => $('stage');
const results = [];
let ENV = {};

/* ---------- rapport ---------- */

const displayMode = () =>
  ['standalone', 'fullscreen', 'minimal-ui', 'browser'].find((m) => matchMedia('(display-mode: ' + m + ')').matches) ||
  (navigator.standalone ? 'standalone(legacy)' : 'onbekend');

const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

const MARKS = { ok: ['✓', 'ok'], fail: ['✗', 'bad'], warn: ['!', 'warn'], skip: ['–', 'dim'], run: ['…', 'dim'] };

function row(r) {
  const mark = MARKS[r.status] || MARKS.run;
  let tr = document.querySelector('tr[data-id="' + r.id + '"]');
  if (!tr) {
    tr = document.createElement('tr');
    tr.dataset.id = r.id;
    $('results').appendChild(tr);
  }
  const ms = r.ms != null ? ' <span class="dim">' + r.ms + ' ms</span>' : '';
  tr.innerHTML =
    '<td class="s ' + mark[1] + '">' + mark[0] + '</td>' +
    '<td class="n">' + esc(r.name) + ms + '</td>' +
    '<td class="d">' + esc(r.detail || '') + '</td>';
}

function record(r) {
  const i = results.findIndex((x) => x.id === r.id);
  if (i >= 0) results[i] = r;
  else results.push(r);
  row(r);
  renderReport();
}

function observations() {
  return {
    aantal_wachtwoordmeldingen: $('obs-prompts').value || null,
    realm_tekst: $('obs-realm').value || null,
    opnieuw_gevraagd_na: $('obs-reload').value || null,
    visueel: $('obs-visual').value || null,
    vrij: $('obs-free').value || null,
  };
}

function renderReport() {
  $('report').value = JSON.stringify(
    {
      ticket: 17,
      run: RUN,
      at: new Date().toISOString(),
      page_origin: location.origin,
      page_url: location.href,
      display_mode: displayMode(),
      environment: ENV,
      probes: results.map((p) => ({ id: p.id, name: p.name, status: p.status, ms: p.ms, detail: p.detail, data: p.data })),
      observations: observations(),
    },
    null,
    2
  );
}

/* ---------- probe-runner ---------- */

async function probe(id, name, fn) {
  record({ id: id, name: name, status: 'run' });
  const t0 = performance.now();
  try {
    const r = await fn();
    record({
      id: id, name: name, status: r.status || 'ok',
      ms: Math.round(r.ms != null ? r.ms : performance.now() - t0),
      detail: r.detail, data: r.data,
    });
    return r;
  } catch (e) {
    record({ id: id, name: name, status: 'fail', ms: Math.round(performance.now() - t0), detail: e.name + ': ' + e.message });
    return { status: 'fail', error: e };
  }
}

/* ---------- primitieven ---------- */

function loadImage(url, timeoutMs) {
  return new Promise((resolve) => {
    const img = new Image();
    const t0 = performance.now();
    const done = (ok, why) => resolve({ ok: ok, ms: performance.now() - t0, w: img.naturalWidth, h: img.naturalHeight, why: why });
    const timer = setTimeout(() => done(false, 'timeout — geen load, geen error (stil kapot, of er staat een dialoog te wachten)'), timeoutMs || 20000);
    img.onload = () => { clearTimeout(timer); done(true); };
    img.onerror = () => { clearTimeout(timer); done(false, 'error-event zonder detail'); };
    img.src = url;
    stage().appendChild(img);
  });
}

async function fetchProbe(url, init) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, init || {});
    const hdr = {};
    try { res.headers.forEach((v, k) => { hdr[k] = v; }); } catch (e) { /* opaque */ }
    return { ok: true, ms: performance.now() - t0, type: res.type, status: res.status, resOk: res.ok, headers: hdr, res: res };
  } catch (e) {
    return { ok: false, ms: performance.now() - t0, error: e.name + ': ' + e.message };
  }
}

function video(url) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('muted', '');
  v.preload = 'auto';
  v.src = url;
  stage().appendChild(v);
  return v;
}

const once = (el, ev, ms) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    el.addEventListener(ev, () => { clearTimeout(t); resolve(ev); }, { once: true });
  });

/* ---------- omgeving ---------- */

function readEnv() {
  ENV = {
    ua: navigator.userAgent,
    display_mode: displayMode(),
    navigator_standalone: navigator.standalone != null ? navigator.standalone : null,
    secure_context: isSecureContext,
    scherm: screen.width + 'x' + screen.height + ' @' + devicePixelRatio,
    service_worker: 'serviceWorker' in navigator,
    storage_api: !!navigator.storage,
  };
  $('env').innerHTML = Object.keys(ENV)
    .map((k) => '<dt>' + k + '</dt><dd>' + esc(ENV[k] === null ? '—' : ENV[k]) + '</dd>')
    .join('');
  $('whoami').textContent = location.origin + ' · ' + displayMode() + ' · run ' + RUN;
}

/* ---------- service worker ---------- */

function swAsk(msg, ms) {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker.controller;
    if (!sw) return resolve({ error: 'geen controller — herlaad de pagina één keer' });
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve({ error: 'timeout' }), ms || 20000);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data); };
    sw.postMessage(msg, [ch.port2]);
  });
}

/* ---------- de probes ---------- */

async function runAll() {
  $('run').disabled = true;
  readEnv();

  /* IJkpunt. Faalt deze, dan is de harness stuk en zegt de rest niets. */
  await probe('canary', 'IJkpunt: <img> naast deze pagina', async () => {
    const r = await loadImage(bust('./canary.png'));
    return { status: r.ok ? 'ok' : 'fail', ms: r.ms, detail: r.ok ? r.w + 'x' + r.h : r.why };
  });

  /* Punt 3 van het ticket: de kern van ADR 0004. */
  await probe('img', '<img> achter de drempel', async () => {
    const r = await loadImage(bust('./media/photo.jpg'));
    return { status: r.ok ? 'ok' : 'fail', ms: r.ms, detail: r.ok ? r.w + 'x' + r.h + ' gerenderd' : r.why };
  });

  await probe('catalogue', 'fetch() van de catalogus (JSON)', async () => {
    const r = await fetchProbe(bust('./catalogue.json'));
    if (!r.ok) return { status: 'fail', ms: r.ms, detail: r.error };
    const body = await r.res.text().catch(() => '');
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (e) { /* laat null */ }
    return {
      status: r.status === 200 && parsed ? 'ok' : 'fail',
      ms: r.ms,
      detail: 'status=' + r.status + ' · ' + (parsed ? 'geldige JSON, marker=' + parsed.marker : 'geen JSON: ' + JSON.stringify(body.slice(0, 60))),
    };
  });

  /* Draagt een fetch zonder credentials-modus de Basic-header mee?
     Relevant omdat een app die 'omit' zet zichzelf buitensluit. */
  await probe('fetch-omit', "fetch(..., credentials: 'omit')", async () => {
    const r = await fetchProbe(bust('./media/canary.txt'), { credentials: 'omit' });
    if (!r.ok) return { status: 'fail', ms: r.ms, detail: r.error };
    return {
      status: r.status === 200 ? 'ok' : 'warn',
      ms: r.ms,
      detail: 'status=' + r.status + (r.status === 401 ? ' — omit sluit je buiten: de app mag dit nooit zetten' : ' — Safari stuurt Basic ook bij omit'),
    };
  });

  /* Punt 4: overleven range-verzoeken de drempel? De speler stelt er drie. */
  await probe('range-head', 'Range bytes=0-1023', async () => {
    const r = await fetchProbe(bust('./media/clip.mov'), { headers: { Range: 'bytes=0-1023' } });
    if (!r.ok) return { status: 'fail', ms: r.ms, detail: r.error };
    return {
      status: r.status === 206 ? 'ok' : 'fail',
      ms: r.ms,
      detail: 'status=' + r.status + ' Content-Range=' + (r.headers['content-range'] || '—') + ' Accept-Ranges=' + (r.headers['accept-ranges'] || '—'),
      data: r.headers,
    };
  });

  /* De staart: een iPhone-.mov heeft zijn index aan het eind (gemeten in #5). */
  await probe('range-tail', 'Range bytes=19922944- (de staart van de clip)', async () => {
    const r = await fetchProbe(bust('./media/clip.mov'), { headers: { Range: 'bytes=19922944-' } });
    if (!r.ok) return { status: 'fail', ms: r.ms, detail: r.error };
    return {
      status: r.status === 206 ? 'ok' : 'fail',
      ms: r.ms,
      detail: 'status=' + r.status + ' Content-Range=' + (r.headers['content-range'] || '—'),
    };
  });

  await probe('video', '<video> achter de drempel: metadata → play → seek', async () => {
    const v = video(bust('./media/clip.mov'));
    const t0 = performance.now();
    const meta = await once(v, 'loadedmetadata', 30000);
    if (!meta) {
      const code = v.error ? v.error.code : '—';
      v.remove();
      return { status: 'fail', detail: 'geen loadedmetadata binnen 30 s (readyState=' + v.readyState + ', MediaError=' + code + ')' };
    }
    const tMeta = Math.round(performance.now() - t0);
    let playing = 'nee';
    try {
      await v.play();
      playing = (await once(v, 'timeupdate', 8000)) ? 'ja' : 'play() gelukt maar geen timeupdate';
    } catch (e) {
      playing = 'play() geweigerd: ' + e.name;
    }
    const dur = v.duration;
    v.currentTime = Math.max(1, (dur || 10) * 0.6);
    const seeked = await once(v, 'seeked', 15000);
    const data = { w: v.videoWidth, h: v.videoHeight, duration: dur, metadata_ms: tMeta, seek: !!seeked, play: playing };
    v.pause();
    v.remove();
    return {
      status: seeked && playing === 'ja' ? 'ok' : 'warn',
      detail: 'metadata ' + tMeta + ' ms · ' + data.w + 'x' + data.h + ' · ' + (dur ? dur.toFixed(1) : '?') +
        ' s · speelt: ' + playing + ' · seek: ' + (seeked ? 'ja' : 'NEE'),
      data: data,
    };
  });

  /* Punt 6: de doorvoerpost die ADR 0004 nog niet kent. Op nginx is 25,4 MB/s
     gemeten (#5, Chrome). Dit getal hoort daar rechtstreeks tegenover. */
  await probe('throughput', 'Doorvoer: 20 MB clip door Apache + Basic', async () => {
    const t0 = performance.now();
    const r = await fetchProbe(bust('./media/clip.mov'));
    if (!r.ok) return { status: 'fail', detail: r.error };
    const buf = await r.res.arrayBuffer();
    const ms = performance.now() - t0;
    const mb = buf.byteLength / 1048576;
    const mbps = mb / (ms / 1000);
    return {
      status: mb > 1 ? 'ok' : 'fail',
      ms: Math.round(ms),
      detail: mb.toFixed(1) + ' MB in ' + (ms / 1000).toFixed(1) + ' s = ' + mbps.toFixed(1) + ' MB/s (' + (mbps * 8).toFixed(0) + ' Mbit/s) · nginx deed 25,4 MB/s',
      data: { bytes: buf.byteLength, ms: Math.round(ms), mb_per_s: +mbps.toFixed(2) },
    };
  });

  /* De open map van #5 moet open blijven: anders vervuilt deze spike die metingen. */
  await probe('open-dir', 'CONTROLE: /spike/ is nog zonder drempel bereikbaar', async () => {
    const r = await fetchProbe(bust(OPEN_PATH));
    if (!r.ok) return { status: 'fail', ms: r.ms, detail: r.error };
    return {
      status: r.status === 200 ? 'ok' : 'fail',
      ms: r.ms,
      detail: 'status=' + r.status + (r.status === 401 ? ' — de drempel lekt naar /spike/, dat mag niet' : ''),
    };
  });

  await probe('sw-register', 'Service worker registreren', async () => {
    if (!('serviceWorker' in navigator)) return { status: 'fail', detail: 'niet ondersteund' };
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    const ctrl = !!navigator.serviceWorker.controller;
    return {
      status: ctrl ? 'ok' : 'warn',
      detail: 'scope=' + reg.scope + ' · controller=' + (ctrl ? 'ja' : 'NEE — herlaad de pagina één keer en draai opnieuw'),
    };
  });

  /* De open vraag die nergens beantwoord is: draagt een verzoek dat de worker
     zélf uitstuurt het opgeslagen Basic-credential mee? De PWA-cache hangt erop. */
  await probe('sw-own-fetch', 'fetch() dat de service worker zélf uitstuurt', async () => {
    if (!navigator.serviceWorker.controller) return { status: 'skip', detail: 'geen controller' };
    const a = await swAsk({ cmd: 'probeFetch', url: bust('./media/canary.txt') });
    const b = await swAsk({ cmd: 'probeFetch', url: bust('./media/canary.txt'), credentials: 'omit' });
    const ok = a.status === 200;
    return {
      status: ok ? 'ok' : 'fail',
      detail: 'default: status=' + a.status + (a.error ? ' (' + a.error + ')' : '') +
        ' · omit: status=' + b.status + (b.error ? ' (' + b.error + ')' : ''),
      data: { normaal: a, omit: b },
    };
  });

  await probe('sw-cache-put', 'cache.put() achter de drempel', async () => {
    const url = bust('./media/photo.jpg');
    const cache = await caches.open('authspike-' + RUN);
    const res = await fetch(url);
    await cache.put(url, res.clone());
    const back = await cache.match(url);
    return {
      status: back && back.status === 200 ? 'ok' : 'fail',
      detail: back ? 'terug uit de cache: type=' + back.type + ' status=' + back.status : 'niets teruggevonden',
    };
  });

  await probe('sw-img-from-cache', '<img> uitgeserveerd vanuit de SW-cache', async () => {
    if (!navigator.serviceWorker.controller) return { status: 'skip', detail: 'geen controller' };
    const url = './media/photo.jpg?cached=' + RUN;
    const cache = await caches.open('authspike-sw');
    await cache.put(url, await fetch(url));
    await swAsk({ cmd: 'mode', mode: 'cacheFirst' });
    const r = await loadImage(url);
    const log = await swAsk({ cmd: 'log' });
    await swAsk({ cmd: 'mode', mode: 'log' });
    const hit = (log.entries || []).find((e) => e.url.indexOf('cached=' + RUN) >= 0);
    return {
      status: r.ok && hit && hit.fromCache ? 'ok' : r.ok ? 'warn' : 'fail',
      detail: r.ok ? 'gerenderd ' + r.w + 'x' + r.h + ' · uit de cache: ' + (hit && hit.fromCache ? 'ja' : 'onbekend') : r.why,
    };
  });

  await probe('persist', 'navigator.storage: persist / estimate', async () => {
    if (!navigator.storage) return { status: 'skip', detail: 'geen storage-API' };
    const granted = navigator.storage.persist ? await navigator.storage.persist() : null;
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage.estimate ? await navigator.storage.estimate() : {};
    return {
      status: persisted ? 'ok' : 'warn',
      detail: 'persist()=' + granted + ' persisted()=' + persisted +
        ' usage=' + ((est.usage || 0) / 1048576).toFixed(1) + ' MB' +
        ' quota=' + ((est.quota || 0) / 1048576).toFixed(0) + ' MB',
      data: est,
    };
  });

  $('run').disabled = false;
  renderReport();
}

/* Apart: hij zet 20 MB in de cache en kan het video-element laten struikelen. */
async function runSwVideo() {
  $('run-sw-video').disabled = true;
  await probe('sw-sees-video', 'Ziet de SW het verzoek van een <video>?', async () => {
    if (!navigator.serviceWorker.controller) return { status: 'skip', detail: 'geen controller' };
    await swAsk({ cmd: 'clear' });
    const v = video('./media/clip.mov?swseen=' + RUN);
    await once(v, 'loadedmetadata', 20000);
    v.pause();
    v.remove();
    const log = await swAsk({ cmd: 'log' });
    const seen = (log.entries || []).filter((e) => e.url.indexOf('swseen=' + RUN) >= 0);
    return {
      status: seen.length ? 'ok' : 'warn',
      detail: seen.length
        ? seen.map((e) => 'destination=' + e.destination + ' mode=' + e.mode + ' Range=' + (e.range || '—')).join(' | ')
        : 'GEEN — <video>-verzoeken passeren de fetch-handler niet op dit toestel',
      data: seen,
    };
  });
  $('run-sw-video').disabled = false;
}

/* Punt 5 van het ticket: het faalpatroon, niet het slagen.
   De research vond dat Safari cross-origin niet vráágt en met een leeg
   credential doorgaat — een stil kapot <img>. ADR 0004 rekent erop dat
   same-origin zich anders gedraagt. Twee manieren om dat te tonen. */
async function runFail() {
  $('run-fail').disabled = true;

  /* (a) Deterministisch: een expliciet fout credential op een same-origin fetch. */
  await probe('wrong-explicit', 'fetch() met een expliciet FOUT credential', async () => {
    const r = await fetchProbe(bust('./media/canary.txt'), {
      headers: { Authorization: 'Basic ' + btoa('ipad:ditisfout') },
    });
    if (!r.ok) return { status: 'warn', ms: r.ms, detail: 'fetch wierp: ' + r.error };
    return {
      status: r.status === 401 ? 'ok' : 'warn',
      ms: r.ms,
      detail: 'status=' + r.status + ' WWW-Authenticate=' + (r.headers['www-authenticate'] || '— (niet blootgesteld aan script)') +
        (r.status === 401 ? ' — de server wijst af, zichtbaar' : ' — het foute credential werd NIET afgewezen'),
      data: r.headers,
    };
  });

  /* (b) Het echte faalpatroon: een <img> naar een tweede drempel met een ander
     realm, waarvan dit toestel het credential niet heeft. Vraagt Safari, of
     breekt de afbeelding stil? Dit is de aanname van ADR 0004, kaal. */
  await probe('img-second-realm', '<img> achter een TWEEDE drempel (ander realm, onbekend credential)', async () => {
    const r = await loadImage(bust(REALM2 + 'photo.jpg'), 45000);
    return {
      status: r.ok ? 'warn' : 'ok',
      ms: r.ms,
      detail: r.ok
        ? 'GELADEN — er is dus een credential geaccepteerd; noteer of je erom gevraagd bent'
        : 'niet geladen — ' + r.why + '. Noteer of Safari om een wachtwoord vroeg.',
    };
  });

  await probe('fetch-second-realm', 'fetch() achter diezelfde tweede drempel', async () => {
    const r = await fetchProbe(bust(REALM2 + 'canary.txt'));
    if (!r.ok) return { status: 'warn', ms: r.ms, detail: 'fetch wierp: ' + r.error };
    return {
      status: r.status === 401 ? 'ok' : 'warn',
      ms: r.ms,
      detail: 'status=' + r.status,
    };
  });

  $('run-fail').disabled = false;
}

$('run').addEventListener('click', runAll);
$('run-sw-video').addEventListener('click', runSwVideo);
$('run-fail').addEventListener('click', runFail);
$('copy').addEventListener('click', async () => {
  renderReport();
  try {
    await navigator.clipboard.writeText($('report').value);
    $('copy').textContent = 'Gekopieerd ✓';
  } catch (e) {
    $('report').select();
    $('copy').textContent = 'Selecteer en kopieer';
  }
  setTimeout(() => { $('copy').textContent = 'Kopieer rapport'; }, 2500);
});
['obs-prompts', 'obs-realm', 'obs-reload', 'obs-visual', 'obs-free'].forEach((id) => $(id).addEventListener('input', renderReport));

readEnv();
renderReport();
