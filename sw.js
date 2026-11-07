// Offline-Speicher für den Finanzplaner.
// Eigene Dateien: erst Netz (damit Updates ankommen), sonst Cache. Texterkennung und Bild-KI: erst Cache.
const SHELL = 'finanzplaner-shell-v14';
const RUNTIME = 'finanzplaner-runtime-v2';
const META = 'finanzplaner-meta';

// Erinnerung zum Monatsende: Chrome weckt installierte Apps regelmäßig (Periodic Background Sync)
self.addEventListener('periodicsync', e => { if (e.tag === 'monatsende') e.waitUntil(monthEndReminder()); });
async function monthEndReminder() {
  const d = new Date(), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() < last - 1) return;
  const key = new Request('./erinnert-' + d.getFullYear() + '-' + (d.getMonth() + 1));
  const c = await caches.open(META);
  if (await c.match(key)) return;
  await c.put(key, new Response('1'));
  await self.registration.showNotification('Monatsende im Finanzplaner', {
    body: 'Hake deine Buchungen ab, vergleiche den Kontostand mit deiner Bank und sichere deine Daten.',
    icon: 'icon-192.png', badge: 'icon-192.png', tag: 'monatsende'
  });
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => ws.length ? ws[0].focus() : clients.openWindow('./')));
});

const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME && k !== META).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fremde Server (z. B. Schriften, Bibliotheken für den Import) nicht abfangen – der Browser lädt sie selbst
  if (url.origin !== location.origin) return;
  // Texterkennung und Bild-KI (große, unveränderliche Dateien): erst Cache, sonst Netz
  if (url.pathname.includes('/tesseract/') || url.pathname.includes('/ki/')) {
    e.respondWith(caches.open(RUNTIME).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone()).catch(() => {});
      return res;
    }))));
    return;
  }
  // App-Dateien: erst Netz (damit Updates ankommen), offline aus dem Cache
  e.respondWith(
    fetch(req)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)).catch(() => {}); } return res; })
      .catch(() => caches.match(req).then(m => m || caches.match('index.html')))
  );
});
