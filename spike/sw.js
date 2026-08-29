/* Service worker voor de media-spike (issue #5).
   Doet in de standaardstand met opzet niets: hij logt alleen, en roept
   respondWith() niet aan. Zo meet de rest van de spike het gedrag van het
   toestel, niet dat van deze worker. De pagina schakelt hem per probe om. */

let mode = 'log'; // 'log' | 'cacheFirst' | 'rangeAs200'
const CACHE = 'spike-sw';
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
  const range = req.headers.get('Range');
  const entry = {
    url: req.url,
    method: req.method,
    destination: req.destination, // 'image' / 'video' / '' — dit is wat we willen weten
    mode: req.mode,
    range: range,
    at: Date.now(),
    fromCache: false,
  };

  // Standaardstand: alleen kijken. Geen respondWith, dus het toestel doet
  // precies wat het zonder service worker ook zou doen.
  if (mode === 'log') {
    note(entry);
    return;
  }

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

  if (mode === 'rangeAs200') {
    // De riskante stand: beantwoord ook een range-verzoek met de volledige 200
    // uit de cache. De vraag is of WebKit daarmee afspeelt en of seeken werkt.
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req.url).then((hit) => {
          entry.fromCache = !!hit;
          entry.answeredFullWith200 = !!hit && !!range;
          note(entry);
          return hit || fetch(req);
        })
      )
    );
    return;
  }

  note(entry);
});
