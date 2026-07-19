const CACHE_NAME = 'ludobox-vivi-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './splash.png',
  './splash.gif',
  './splash.mp4',
  './iconalphabet.png',
  './iconanglais.png',
  './iconanimaux.png',
  './iconartiste.png',
  './iconchiffres.png',
  './iconcontraires.png',
  './iconcouleurs.png',
  './iconformes.png',
  './iconlecture.png',
  './iconmemoire.png',
  './iconnourriture.png',
  './iconregles.png',
  './girafeentier.png',
  './girafejaune.png',
  './koalaentier.png',
  './koalagris.png',
  './lionblanc.png',
  './lionentier.png',
  './panthereentier.png',
  './pantherenoire.png',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // On met chaque fichier en cache individuellement : si un seul fichier
      // est manquant ou en erreur, ça ne fait pas échouer tout le cache
      // (contrairement à cache.addAll qui est "tout ou rien").
      Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('SW: fichier non mis en cache ->', url, err);
        }))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
