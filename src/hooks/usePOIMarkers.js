// src/hooks/usePOIMarkers.js
import { useCallback, useRef } from "react";

/**
 * Yakındaki yerleri (Nearby Search) işaretlemek ve tıklanabilir yapmak için basit yönetici.
 * Advanced Marker şart değil; klasik Marker kullanıyoruz.
 */
export function usePOIMarkers(mapRef, placesServiceRef) {
  const poiMarkersRef = useRef(new Map());

  const clearAll = useCallback(() => {
    for (const [, m] of poiMarkersRef.current) {
      try { m.setMap(null); } catch {}
    }
    poiMarkersRef.current.clear();
  }, []);

  const refreshNearby = useCallback((center, radiusMeters, onClick) => {
    if (!mapRef.current || !placesServiceRef.current || !center) return;
    const svc = placesServiceRef.current;

    const req = {
      location: center,
      radius: radiusMeters,
      type: ["establishment"], // genel işyerleri
    };

    svc.nearbySearch(req, (results, status) => {
      const ok = window.google.maps.places.PlacesServiceStatus.OK;
      if (status !== ok || !results) return;

      const keep = new Set();
      // Çok kalabalık olmasın diye ilk 40 sonuç
      results.slice(0, 40).forEach((r) => {
        const id = r.place_id;
        keep.add(id);

        const pos = r.geometry?.location;
        if (!pos) return;

        if (!poiMarkersRef.current.has(id)) {
          const marker = new window.google.maps.Marker({
            position: { lat: pos.lat(), lng: pos.lng() },
            map: mapRef.current,
            title: r.name || "",
            // Küçük, belirgin bir pin (daire)
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: "#5B8DEF",
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            },
            zIndex: 200,
          });
          marker.addListener("click", () => onClick && onClick(r));
          poiMarkersRef.current.set(id, marker);
        }
      });

      // artık listede olmayanları sil
      for (const [id, m] of poiMarkersRef.current) {
        if (!keep.has(id)) {
          try { m.setMap(null); } catch {}
          poiMarkersRef.current.delete(id);
        }
      }
    });
  }, [mapRef, placesServiceRef]);

  return { refreshNearby, clearAll };
}
