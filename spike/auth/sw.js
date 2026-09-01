/* Service worker voor de auth-spike (issue #17).
   Standaardstand: alleen loggen, geen respondWith(). Zo meet de spike het
   gedrag van het toestel, niet dat van deze worker.

   Nieuw ten opzichte van de worker van #5: `probeFetch`. Dat is de open vraag
   die nergens beantwoord is — draagt een verzoek dat de worker *zelf* uitstuurt
   het opgeslagen Basic-credential mee? De PWA-cache van ADR 0004 hangt erop. */

let mode = 'log'; // 'log' | 'cacheFirst'
const CACHE = 'authspike-sw';
const MAX_LOG = 200;
let log = [];

self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('message', (e) => {
  const reply = (data) => e.ports[0] && e.ports[0].postMessage(data);
  const msg = e.data || {};

  if (msg.cmd === 'mode') {
    mode = msg.mode;
    reply({ ok: true, mode: mode });
  } else if (msg.cmd === 'log') {
    reply({ entries: log });
  } else if (msg.cmd === 'clear') {
    log = [];
    reply({ ok: true });
  } else if (msg.cmd === 'probeFetch') {
    const init = msg.credentials ? { credentials: msg.credentials } : {};
    fetch(msg.url, init)
      .then((res) => reply({ status: res.status, type: res.type, ok: res.ok }))
      .catch((err) => reply({ error: err.name + ': ' + err.message }));
  } else {
    reply({ error: 'onbekend commando' });
  }
});

function note(entry) {
  log.push(entry);
  if (log.length > MAX_LOG) log.shift();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const entry = {
    url: req.url,
    method: req.method,
    destination: req.destination,
    mode: req.mode,
    credentials: req.credentials,
    range: req.headers.get('Range'),
    at: Date.now(),
    fromCache: false,
  };

  if (mode === 'cacheFirst') {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req.url).then((hit) => {
          entry.fromCache = !!hit;
          note(entry);
          return hit || fetch(req);
        })
      )
    );
    return;
  }

  note(entry);
});
