// src/services/clusterer.js — TAM DOSYA (YENİ)
// İnce sarmalayıcı: Google'ın resmi markerclusterer v2 kütüphanesi için
// Basit bir API: createClusterer(map, markers, opts?) -> { setMarkers, clear, destroy }

import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";

/**
 * @typedef {google.maps.Marker | any} AnyMarker
 * AdvancedMarkerElement de kabul — kütüphane bunu destekliyor.
 */

/**
 * @param {google.maps.Map} map
 * @param {AnyMarker[]} markers
 * @param {{ maxZoom?: number, gridSize?: number }=} opts
 */
export function createClusterer(map, markers = [], opts = {}) {
  const algorithm = new SuperClusterAlgorithm({
    // maxZoom: cluster'ın en son çalışacağı seviye (daha yüksek zoomda tek tek marker gösteririz)
    maxZoom: Number.isFinite(opts.maxZoom) ? opts.maxZoom : 14,
    // radius (px): grid yoğunluğu/algılama yarıçapı
    radius: Number.isFinite(opts.gridSize) ? opts.gridSize : 60,
  });

  /** @type {MarkerClusterer} */
  const clusterer = new MarkerClusterer({
    map,
    markers: Array.isArray(markers) ? markers.filter(Boolean) : [],
    algorithm,
  });

  let destroyed = false;

  return {
    /**
     * Tüm kümeyi yeni marker dizisiyle günceller.
     * @param {AnyMarker[]} nextMarkers
     */
    setMarkers(nextMarkers) {
      if (destroyed) return;
      try {
        clusterer.clearMarkers();
        if (Array.isArray(nextMarkers) && nextMarkers.length > 0) {
          clusterer.addMarkers(nextMarkers.filter(Boolean));
        }
      } catch (e) {
        console.warn?.("[clusterer] setMarkers error:", e?.message || e);
      }
    },
    /** Kümeleri temizle (clusterer yaşamaya devam eder). */
    clear() {
      if (destroyed) return;
      try { clusterer.clearMarkers(); } catch {}
    },
    /** Tüm referansları temizle. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { clusterer.clearMarkers(); } catch {}
      try { clusterer.setMap?.(null); } catch {}
    },
  };
}

export default createClusterer;
