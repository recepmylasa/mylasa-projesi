// src/services/clusterer.js
// Marker clusterer için bağımlılıksız (NPM’siz) sarmalayıcı.
// Önce @googlemaps/markerclusterer'i CDN'den yükler; olmazsa zarif fallback çalışır.
// Dış API (MapMobile ile uyumlu):
//   const ctrl = createClusterer(map, [], { gridSize: 60, maxZoom: 14 });
//   ctrl.setMarkers(markers);
//   ctrl.clear();
//   ctrl.destroy();

let _loaderPromise = null;

// CDN'den markerclusterer'ı yükler (global: window.markerClusterer)
function loadClustererFromCDN() {
  if (typeof window !== "undefined" && window.markerClusterer?.MarkerClusterer) {
    return Promise.resolve(window.markerClusterer);
  }
  if (_loaderPromise) return _loaderPromise;

  _loaderPromise = new Promise((resolve) => {
    try {
      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
      // Resmi paket: UMD bundle → window.markerClusterer namespace'i oluşturur
      script.src = "https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js";
      script.onload = () => resolve(window.markerClusterer || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    } catch {
      resolve(null);
    }
  });

  return _loaderPromise;
}

/**
 * Clusterer controller üretir.
 * @param {google.maps.Map} map
 * @param {Array<any>} initialMarkers
 * @param {{gridSize?:number, maxZoom?:number}} opts
 */
export function createClusterer(map, initialMarkers = [], opts = {}) {
  const state = {
    map,
    clusterer: null,
    destroyed: false,
    fallback: false,
    // Fallback'ta ekrana verdiğimiz marker'ları takip edelim ki clear() ile indirebilelim
    fbShown: new Set(),
  };

  // Uyum katmanı: yeni kütüphanenin algoritma seçeneklerini gelen gridSize/maxZoom ile eşleştir
  function toAlgorithm(lib) {
    try {
      if (!lib?.SuperClusterAlgorithm) return undefined;
      const algoOpts = {};
      if (Number.isFinite(opts.gridSize)) algoOpts.radius = Number(opts.gridSize); // px
      if (Number.isFinite(opts.maxZoom)) algoOpts.maxZoom = Number(opts.maxZoom);
      return new lib.SuperClusterAlgorithm(algoOpts);
    } catch {
      return undefined;
    }
  }

  async function ensureClusterer(markers = []) {
    if (state.destroyed || state.clusterer || state.fallback == null) return;
    const lib = await loadClustererFromCDN();
    if (state.destroyed) return;

    if (lib?.MarkerClusterer) {
      try {
        const algorithm = toAlgorithm(lib);
        state.clusterer = new lib.MarkerClusterer({
          map: state.map,
          markers: Array.isArray(markers) ? markers : [],
          algorithm,
        });
        state.fallback = false;
      } catch {
        state.clusterer = null;
        state.fallback = true;
      }
    } else {
      state.fallback = true;
    }
  }

  function fbShow(markers) {
    // Fallback: cluster yoksa marker'ları tek tek map'e geri koy (degrade graceful)
    if (!Array.isArray(markers)) return;
    markers.forEach((m) => {
      try { m.setMap?.(state.map); } catch {}
      if (m) state.fbShown.add(m);
    });
  }

  function fbClear() {
    // Fallback sırasında bizim gösterdiklerimizi geri indir
    state.fbShown.forEach((m) => {
      try { m.setMap?.(null); } catch {}
    });
    state.fbShown.clear();
  }

  const ctrl = {
    async setMarkers(markers) {
      if (state.destroyed) return;
      // Kütüphane yoksa/fallback ise graceful degrade
      if (state.fallback) {
        fbClear();
        fbShow(markers);
        return;
      }

      // Clusterer henüz hazır değilse yükleyip öyle ayarla
      if (!state.clusterer) {
        await ensureClusterer(markers);
        if (state.fallback) { fbClear(); fbShow(markers); return; }
        if (!state.clusterer) return; // yükleme başarısızsa sessiz düş
      }

      try {
        // V2 API: clear + add
        state.clusterer.clearMarkers();
        if (Array.isArray(markers) && markers.length) {
          state.clusterer.addMarkers(markers);
        }
      } catch {
        // Her ihtimale karşı fallback'a geç
        state.fallback = true;
        try { state.clusterer?.setMap?.(null); } catch {}
        state.clusterer = null;
        fbClear();
        fbShow(markers);
      }
    },

    clear() {
      if (state.destroyed) return;
      if (state.fallback) { fbClear(); return; }
      try { state.clusterer?.clearMarkers?.(); } catch {}
    },

    destroy() {
      state.destroyed = true;
      if (state.fallback) { fbClear(); return; }
      try {
        state.clusterer?.clearMarkers?.();
        state.clusterer?.setMap?.(null);
      } catch {}
      state.clusterer = null;
    },
  };

  // Arkaplanda kütüphaneyi ayağa kaldır (başarısız olursa fallback devreye girer)
  ensureClusterer(initialMarkers).catch(() => { /* sessiz */ });

  return ctrl;
}

export default createClusterer;
