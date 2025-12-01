// src/pages/RoutesExploreMobile/utils/nearMapPins.js
// ADIM 33: Yakınımda modunda marker + cluster yönetimi

import { MarkerClusterer } from "@googlemaps/markerclusterer";

/**
 * Verilen harita için bir MarkerClusterer örneği oluşturur.
 */
export function createCluster(map) {
  if (!map || typeof window === "undefined") return null;
  const gmaps = window.google?.maps;
  if (!gmaps) return null;

  try {
    return new MarkerClusterer({
      map,
      markers: [],
    });
  } catch {
    return null;
  }
}

/**
 * Marker'ları verilen rota listesine göre senkronize eder.
 * - items içindeki her rota için (routeGeo.center varsa) marker oluşturur.
 * - Artık listede olmayan marker'ları temizler.
 * - selectedId için marker'ı vurgular.
 * - marker tıklanınca onSelect(routeId) çağrılır.
 *
 * markersMap: id → marker objesi map'i (opsiyonel).
 * Geri dönen değer güncel markersMap'tir.
 */
export function syncPins({
  map,
  cluster,
  items,
  selectedId,
  onSelect,
  markersMap,
}) {
  if (!map || typeof window === "undefined") {
    return markersMap || {};
  }

  const gmaps = window.google?.maps;
  if (!gmaps?.Marker) {
    return markersMap || {};
  }

  const current = markersMap || {};
  const next = { ...current };
  const nextIds = new Set();

  const baseIcon = {
    path: gmaps.SymbolPath.CIRCLE,
    scale: 6,
    fillColor: "#1d4ed8",
    fillOpacity: 0.9,
    strokeColor: "#ffffff",
    strokeWeight: 2,
  };

  const selectedIcon = {
    ...baseIcon,
    scale: 8,
    fillColor: "#111827",
  };

  (items || []).forEach((r) => {
    const c = r?.routeGeo?.center;
    if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return;
    const id = r.id;
    if (!id) return;
    const key = String(id);

    nextIds.add(key);

    if (!current[key]) {
      const marker = new gmaps.Marker({
        position: { lat: c.lat, lng: c.lng },
        map,
        icon: baseIcon,
      });

      if (marker && typeof marker.addListener === "function") {
        marker.addListener("click", () => {
          if (typeof onSelect === "function") {
            onSelect(key);
          }
        });
      }

      next[key] = marker;
      if (cluster && typeof cluster.addMarker === "function") {
        cluster.addMarker(marker);
      }
    }
  });

  // Artık listede olmayan marker'ları kaldır
  Object.keys(current).forEach((id) => {
    if (!nextIds.has(id)) {
      const marker = current[id];
      if (marker) {
        if (cluster && typeof cluster.removeMarker === "function") {
          try {
            cluster.removeMarker(marker);
          } catch {
            // no-op
          }
        }
        if (typeof marker.setMap === "function") {
          marker.setMap(null);
        }
      }
      delete next[id];
    }
  });

  // Seçili marker'ı vurgula
  const sel = selectedId ? String(selectedId) : null;
  Object.entries(next).forEach(([id, marker]) => {
    if (!marker || typeof marker.setIcon !== "function") return;
    if (sel && id === sel) {
      marker.setIcon(selectedIcon);
      if (typeof marker.setZIndex === "function") {
        try {
          marker.setZIndex(
            gmaps.Marker.MAX_ZINDEX
              ? gmaps.Marker.MAX_ZINDEX + 1
              : 999999
          );
        } catch {
          // no-op
        }
      }
    } else {
      marker.setIcon(baseIcon);
      if (typeof marker.setZIndex === "function") {
        try {
          marker.setZIndex(undefined);
        } catch {
          // no-op
        }
      }
    }
  });

  return next;
}

/**
 * Tüm marker'ları haritadan kaldırır ve cluster'ı temizler.
 * markersMap'i boş bir objeye resetleyip döner.
 */
export function clearPins({ cluster, markersMap }) {
  const markers = markersMap || {};

  Object.values(markers).forEach((marker) => {
    if (marker && typeof marker.setMap === "function") {
      marker.setMap(null);
    }
  });

  if (cluster && typeof cluster.clearMarkers === "function") {
    try {
      cluster.clearMarkers();
    } catch {
      // no-op
    }
  }

  return {};
}
