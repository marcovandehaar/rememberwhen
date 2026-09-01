/* rememberwhen media spike — issue #5.
   Draait op twee origins met exact dezelfde code:
     - same-origin : https://nas.vandehaar.dev/spike/   (de PWA staat op de NAS)
     - cross-origin: de Azure Static Web App            (publieke origin -> privé adresruimte)
   De pagina rapporteert zichzelf: op de iPad is er geen console. */

/* Te overschrijven via de URL, zodat een afwijkende poort geen code-wijziging
   kost: ?nas=https://nas.vandehaar.dev&cors=https://media.vandehaar.dev:8443 */
const Q = new URLSearchParams(location.search);
const NAS_HTTPS = Q.get('nas') || 'https://nas.vandehaar.dev';
const NAS_CORS = Q.get('cors') || 'https://media.vandehaar.dev';
const NAS_HTTP = Q.get('http') || 'http://192.168.0.137';

/* Configuratie A (de bundel staat op de NAS) of B (de bundel staat op een
   publieke origin). Drie probes betekenen alleen iets in geval B. */
const SAME_ORIGIN = location.origin === NAS_HTTPS;
const PHOTO = '/spike/media/photo.jpg';
const CLIP = '/spike/media/clip.mov';
const TXT = '/spike/media/canary.txt';

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
    systeemmelding_lokaal_netwerk: $('obs-prompt').value || null,
    instellingen_lokaal_netwerk: $('obs-settings').value || null,
    visueel: $('obs-visual').value || null,
    vrij: $('obs-free').value || null,
  };
}

function renderReport() {
  $('report').value = JSON.stringify(
    {
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
      id: id,
      name: name,
      status: r.status || 'ok',
      ms: Math.round(r.ms != null ? r.ms : performance.now() - t0),
      detail: r.detail,
      data: r.data,
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
    const timer = setTimeout(() => done(false, 'timeout — geen load, geen error (stil geblokkeerd of hangend)'), timeoutMs || 20000);
    img.onload = () => { clearTimeout(timer); done(true); };
    img.onerror = () => { clearTimeout(timer); done(false, 'error-event zonder detail (een opaque failure meldt niets)'); };
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
  let webgl = 'nee';
  let maxTex = null;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      webgl = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1';
      maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    }
  } catch (e) {
    webgl = 'fout: ' + e.message;
  }

  let tasOnPrototype = false;
  let tasRetained = null;
  let tasError = null;
  try {
    tasOnPrototype = 'targetAddressSpace' in Request.prototype;
    const r = new Request('https://example.invalid/', { targetAddressSpace: 'local' });
    tasRetained = 'targetAddressSpace' in r ? r.targetAddressSpace : '(niet aanwezig op de instantie)';
  } catch (e) {
    tasError = e.name + ': ' + e.message;
  }

  ENV = {
    ua: navigator.userAgent,
    display_mode: displayMode(),
    navigator_standalone: navigator.standalone != null ? navigator.standalone : null,
    secure_context: isSecureContext,
    scherm: screen.width + 'x' + screen.height + ' @' + devicePixelRatio,
    viewport: innerWidth + 'x' + innerHeight,
    hardware_concurrency: navigator.hardwareConcurrency || null,
    // 'nee' is het sterkste signaal dat Lockdown Mode aan staat: WebKit zet WebGLEnabled dan uit
    webgl: webgl,
    max_texture_size: maxTex,
    service_worker: 'serviceWorker' in navigator,
    storage_api: !!navigator.storage,
    // de goedkoopste probe of Local Network Access aan staat
    targetAddressSpace_op_Request_prototype: tasOnPrototype,
    targetAddressSpace_bewaard_op_instantie: tasRetained,
    targetAddressSpace_fout: tasError,
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
    const t = setTimeout(() => resolve({ error: 'timeout' }), ms || 8000);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data); };
    sw.postMessage(msg, [ch.port2]);
  });
}

/* ---------- de probes ---------- */

async function runAll() {
  $('run').disabled = true;
  readEnv();

  /* IJkpunt. De research waarschuwt: een opaque failure meldt niets, dus je hebt
     een same-origin controle nodig om "de harness is stuk" uit te sluiten. */
  await probe('canary', 'IJkpunt: same-origin afbeelding', async () => {
    const r = await loadImage(bust('./canary.png'));
    return { status: r.ok ? 'ok' : 'fail', ms: r.ms, detail: r.ok ? r.w + 'x' + r.h : r.why };
  });

  /* De kernvraag van het ticket. */
  await probe('img-nas', '<img> van nas.vandehaar.dev (HTTPS, no-cors)', async () => {
    const r = await loadImage(bust(NAS_HTTPS + PHOTO));
    return { status: r.ok ? 'ok' : 'fail', ms: r.ms, detail: r.ok ? r.w + 'x' + r.h + ' gerenderd' : r.why };
  });

  await probe('fetch-nocors', 'fetch(no-cors) naar nas.vandehaar.dev', async () => {
    const r = await fetchProbe(bust(NAS_HTTPS + PHOTO), { mode: 'no-cors' });
    if (!r.ok) return { status: 'fail', ms: r.ms, detail: r.error };
    // Same-origin hoort 'basic' te geven, cross-origin 'opaque'. Beide goed.
    const verwacht = SAME_ORIGIN ? 'basic' : 'opaque';
    return {
      status: r.type === verwacht ? 'ok' : 'warn',
      ms: r.ms,
      detail: 'type=' + r.type + ' status=' + r.status + ' (verwacht: ' + verwacht + ')',
    };
  });

  /* De kale Web Station-origin hoort géén ACAO te sturen. Dat is de nulmeting voor configuratie 4. */
  await probe('fetch-cors-plain', 'fetch(cors) naar nas.vandehaar.dev — hoort te falen', async () => {
    if (SAME_ORIGIN) return { status: 'skip', detail: 'n.v.t. — de pagina staat op deze origin' };
    const r = await fetchProbe(bust(NAS_HTTPS + TXT));
    if (!r.ok) return { status: 'ok', ms: r.ms, detail: 'geweigerd zoals verwacht — ' + r.error };
    return {
      status: 'warn',
      ms: r.ms,
      detail: 'onverwacht toegestaan: status=' + r.status + ' ACAO=' + (r.headers['access-control-allow-origin'] || '—'),
      data: r.headers,
    };
  });

  await probe('fetch-cors-media', 'fetch(cors) naar media.vandehaar.dev', async () => {
    const r = await fetchProbe(bust(NAS_CORS + TXT));
    if (!r.ok) return { status: 'fail', ms: r.ms, detail: r.error };
    const body = await r.res.text().catch(() => '');
    return {
      status: r.resOk ? 'ok' : 'warn',
      ms: r.ms,
      detail:
        'status=' + r.status +
        ' ACAO=' + (r.headers['access-control-allow-origin'] || '—') +
        ' TAO=' + (r.headers['timing-allow-origin'] || '—') +
        ' body=' + JSON.stringify(body.slice(0, 40)),
      data: r.headers,
    };
  });

  await probe('range', 'Range-request (bytes=0-1023) op media.vandehaar.dev', async () => {
    const r = await fetchProbe(bust(NAS_CORS + CLIP), { headers: { Range: 'bytes=0-1023' } });
    if (!r.ok) return { status: 'fail', ms: r.ms, detail: r.error };
    return {
      status: r.status === 206 ? 'ok' : 'warn',
      ms: r.ms,
      detail:
        'status=' + r.status +
        ' Content-Range=' + (r.headers['content-range'] || '— (niet blootgesteld)') +
        ' Accept-Ranges=' + (r.headers['accept-ranges'] || '—'),
      data: r.headers,
    };
  });

  await probe('video', '<video> van nas.vandehaar.dev: metadata → play → seek', async () => {
    const v = video(bust(NAS_HTTPS + CLIP));
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
      detail:
        'metadata ' + tMeta + ' ms · ' + data.w + 'x' + data.h + ' · ' + (dur ? dur.toFixed(1) : '?') +
        ' s · speelt: ' + playing + ' · seek: ' + (seeked ? 'ja' : 'NEE'),
      data: data,
    };
  });

  /* Doorvoer wil echte bytes, en die krijg je niet uit een opaque response:
     die lost op zodra de headers binnen zijn, niet het lijf. Draait de pagina
     op de NAS zelf, dan is de clip same-origin en is er niets nodig; anders
     moet het over de CORS-origin. */
  await probe('throughput', 'Doorvoer: de 20 MB clip lezen van de NAS', async () => {
    const sameOrigin = location.origin === NAS_HTTPS;
    const t0 = performance.now();
    const r = await fetchProbe(bust((sameOrigin ? '' : NAS_CORS) + CLIP));
    if (!r.ok) return { status: 'skip', detail: 'bytes niet leesbaar — ' + r.error };
    const buf = await r.res.arrayBuffer();
    const ms = performance.now() - t0;
    const mb = buf.byteLength / 1048576;
    const mbps = mb / (ms / 1000);
    return {
      status: mb > 1 ? 'ok' : 'warn',
      ms: Math.round(ms),
      detail: mb.toFixed(1) + ' MB in ' + (ms / 1000).toFixed(1) + ' s = ' + mbps.toFixed(1) + ' MB/s (' + (mbps * 8).toFixed(0) + ' Mbit/s)',
      data: { bytes: buf.byteLength, ms: Math.round(ms), mb_per_s: +mbps.toFixed(2) },
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

  await probe('sw-cache-put', 'cache.put() van een opaque response', async () => {
    const url = bust(NAS_HTTPS + PHOTO);
    const cache = await caches.open('spike-' + RUN);
    const res = await fetch(url, { mode: 'no-cors' });
    await cache.put(url, res.clone());
    const back = await cache.match(url);
    return {
      status: back ? 'ok' : 'fail',
      detail: back ? 'terug uit de cache: type=' + back.type + ' status=' + back.status : 'niets teruggevonden',
    };
  });

  await probe('sw-cache-addall', 'cache.addAll() van dezelfde URL — hoort te weigeren', async () => {
    // addAll weigert alleen een *opaque* response. Same-origin is niet opaque,
    // dus daar hoort hij te slagen en zegt de probe niets over de research.
    if (SAME_ORIGIN) return { status: 'skip', detail: 'n.v.t. — same-origin levert geen opaque response' };
    const cache = await caches.open('spike-' + RUN);
    try {
      await cache.addAll([bust(NAS_HTTPS + PHOTO)]);
      return { status: 'warn', detail: 'addAll accepteerde het — dat weerspreekt de research' };
    } catch (e) {
      return { status: 'ok', detail: 'geweigerd zoals verwacht — ' + e.name + ': ' + e.message };
    }
  });

  await probe('sw-img-from-cache', '<img> uitgeserveerd vanuit de SW-cache', async () => {
    if (!navigator.serviceWorker.controller) return { status: 'skip', detail: 'geen controller' };
    const url = NAS_HTTPS + PHOTO + '?cached=' + RUN;
    const cache = await caches.open('spike-sw');
    await cache.put(url, await fetch(url, { mode: 'no-cors' }));
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

  /* Vraag 3 van configuratie 5 in de research: bereikt het verzoek van een
     <video>-element de fetch-handler van de service worker überhaupt? */
  await probe('sw-sees-video', 'Ziet de SW het verzoek van een <video>?', async () => {
    if (!navigator.serviceWorker.controller) return { status: 'skip', detail: 'geen controller' };
    await swAsk({ cmd: 'clear' });
    const v = video(NAS_HTTPS + CLIP + '?swseen=' + RUN);
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

  await probe('persist', 'navigator.storage: persist / estimate', async () => {
    if (!navigator.storage) return { status: 'skip', detail: 'geen storage-API' };
    const granted = navigator.storage.persist ? await navigator.storage.persist() : null;
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage.estimate ? await navigator.storage.estimate() : {};
    return {
      status: persisted ? 'ok' : 'warn',
      detail:
        'persist()=' + granted + ' persisted()=' + persisted +
        ' usage=' + ((est.usage || 0) / 1048576).toFixed(1) + ' MB' +
        ' quota=' + ((est.quota || 0) / 1048576).toFixed(0) + ' MB',
      data: est,
    };
  });

  /* De controle. Draai hem ook als je zeker weet dat hij faalt: de foutmelding is de documentatie. */
  await probe('img-http-control', 'CONTROLE: <img> over plain HTTP naar 192.168.0.137', async () => {
    const r = await loadImage(bust(NAS_HTTP + PHOTO), 12000);
    return {
      status: r.ok ? 'warn' : 'ok',
      ms: r.ms,
      detail: r.ok ? 'ONVERWACHT GELADEN (' + r.w + 'x' + r.h + ') — mixed content wordt niet geblokkeerd' : 'geblokkeerd zoals verwacht — ' + r.why,
    };
  });

  await probe('fetch-http-control', 'CONTROLE: fetch over plain HTTP', async () => {
    const r = await fetchProbe(bust(NAS_HTTP + TXT), { mode: 'no-cors' });
    return {
      status: r.ok ? 'warn' : 'ok',
      ms: r.ms,
      detail: r.ok ? 'ONVERWACHT: type=' + r.type + ' status=' + r.status : r.error,
    };
  });

  const spaces = ['local', 'loopback'];
  for (let i = 0; i < spaces.length; i++) {
    const space = spaces[i];
    await probe('tas-' + space, "CONTROLE: fetch(..., targetAddressSpace: '" + space + "')", async () => {
      const r = await fetchProbe(bust(NAS_HTTP + TXT), { mode: 'no-cors', targetAddressSpace: space });
      return {
        status: r.ok ? 'warn' : 'ok',
        ms: r.ms,
        detail: r.ok
          ? 'ONVERWACHT TOEGESTAAN — type=' + r.type + ' status=' + r.status + '. Lees de research opnieuw tegen een nieuwere WebKit.'
          : r.error,
      };
    });
  }

  $('run').disabled = false;
  renderReport();
}

/* Apart, want hij zet 20 MB in de cache en kan het video-element laten struikelen. */
async function runRisky() {
  $('run-risky').disabled = true;
  await probe('sw-range-as-200', 'SW beantwoordt een video-range met een volledige 200', async () => {
    if (!navigator.serviceWorker.controller) return { status: 'skip', detail: 'geen controller' };
    const url = NAS_HTTPS + CLIP + '?range200=' + RUN;
    const cache = await caches.open('spike-sw');
    await cache.put(url, await fetch(url, { mode: 'no-cors' }));
    await swAsk({ cmd: 'mode', mode: 'rangeAs200' }, 20000);
    const v = video(url);
    const meta = await once(v, 'loadedmetadata', 30000);
    let played = 'n.v.t.';
    let seeked = null;
    if (meta) {
      try {
        await v.play();
        played = (await once(v, 'timeupdate', 8000)) ? 'ja' : 'geen timeupdate';
      } catch (e) {
        played = e.name;
      }
      v.currentTime = Math.max(1, (v.duration || 10) * 0.6);
      seeked = await once(v, 'seeked', 15000);
    }
    const err = v.error ? ' MediaError code ' + v.error.code : '';
    v.pause();
    v.remove();
    await swAsk({ cmd: 'mode', mode: 'log' });
    return {
      status: meta && seeked ? 'ok' : 'warn',
      detail: 'metadata: ' + (meta ? 'ja' : 'NEE') + ' · speelt: ' + played + ' · seek: ' + (seeked ? 'ja' : 'NEE') + err,
    };
  });
  $('run-risky').disabled = false;
}

$('run').addEventListener('click', runAll);
$('run-risky').addEventListener('click', runRisky);
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
['obs-prompt', 'obs-settings', 'obs-visual', 'obs-free'].forEach((id) => $(id).addEventListener('input', renderReport));

readEnv();
renderReport();
