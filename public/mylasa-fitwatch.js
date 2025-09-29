/* Mylasa FitWatch v1 – saf JS (HTML yok) */
(function () {
  'use strict';

  const root = document.documentElement;

  // küçük throttle
  let rafId = 0;
  const schedule = (fn) => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(fn);
  };

  function updateVars() {
    // Görsel viewport (UI hariç) ölçüleri
    const vv = window.visualViewport;
    const vw = Math.round(vv ? vv.width  : window.innerWidth);
    const vh = Math.round(vv ? vv.height : window.innerHeight);

    root.style.setProperty('--vw', vw + 'px');
    root.style.setProperty('--vh', vh + 'px');

    // Güvenli alanlar: JS tarafında env() okunmaz; 0 bırakıyoruz.
    // CSS'te max( , env(safe-area-inset-*) ) ile birleştirirsin.
    root.style.setProperty('--safe-left',   '0px');
    root.style.setProperty('--safe-right',  '0px');
    root.style.setProperty('--safe-top',    '0px');
    root.style.setProperty('--safe-bottom', '0px');

    root.classList.add('fitwatch-ready');
  }

  ['resize', 'orientationchange', 'visibilitychange'].forEach(evt => {
    window.addEventListener(evt, () => schedule(updateVars), { passive: true });
  });

  // İlk kurulum
  updateVars();
})();
