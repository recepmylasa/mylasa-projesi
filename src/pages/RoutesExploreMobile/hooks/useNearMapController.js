// src/pages/RoutesExploreMobile/hooks/useNearMapController.js
// Google Maps yükleme, konum izni, viewport takibi, LS_NEAR/LS_RADIUS,
// "Bu alanda ara" CTA ve pin/cluster senkronunu tek yerde toplar.

import { useCallback, useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "../../../hooks/useGoogleMaps";
import { writeJSON } from "../../../utils/urlState";
import { LS_NEAR, LS_RADIUS } from "../utils/stateInit";
import { distanceMeters } from "../utils/routeFormatters";
import { createCluster, syncPins, clearPins } from "../utils/nearMapPins";

export default function useNearMapController({
  sort,
  hasSearch,
  initialNear,
  initialRadius,
  items,
  selectedRouteId,
  onSelectRouteFromMap,
  onViewportChange,
  onSearchArea,
}) {
  const [near, setNear] = useState(
    initialNear &&
      typeof initialNear.lat === "number" &&
      typeof initialNear.lng === "number"
      ? initialNear
      : null
  );
  const [radius, setRadius] = useState(
    typeof initialRadius === "number" && initialRadius > 0 ? initialRadius : 5
  );
  const [locationStatus, setLocationStatus] = useState("unknown"); // unknown | asking | granted | denied
  const [mapReady, setMapReady] = useState(false);
  const [showSearchAreaButton, setShowSearchAreaButton] = useState(false);

  const userLocationRef = useRef(null);
  const nearPersistRef = useRef({
    lastCenter: null,
    lastZoom: null,
    timeoutId: null,
  });
  const markersRef = useRef({});
  const clusterRef = useRef(null);

  // EMİR 9: listener ref’leri (tekil + temizlik)
  const idleListenerRef = useRef(null);
  const dragListenerRef = useRef(null);
  const zoomListenerRef = useRef(null);

  // EMİR 13: artımlı (chunked) pin render state’i
  const pinChunkStateRef = useRef({
    idleId: null,
    batchIndex: 0,
    itemsSnapshot: [],
  });

  const { gmapsStatus, errorMsg, mapDivRef, mapRef, attemptLoad } =
    useGoogleMaps({
      API_KEY: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
      // EMİR 9: MAP_ID için fallback; proje env'de REACT_APP_GMAPS_MAP_ID kullanılıyorsa da çalışır.
      MAP_ID:
        process.env.REACT_APP_GOOGLE_MAPS_MAP_ID ||
        process.env.REACT_APP_GMAPS_MAP_ID,
    });

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("denied");
      return;
    }

    setLocationStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        userLocationRef.current = coords;
        setLocationStatus("granted");

        if (mapRef.current) {
          try {
            mapRef.current.setCenter(coords);
            mapRef.current.setZoom(14);
          } catch {
            // no-op
          }
        }
      },
      () => {
        setLocationStatus("denied");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, [mapRef]);

  // Yakınımda modunda haritayı yükle
  useEffect(() => {
    if (sort !== "near" || hasSearch) return;
    if (gmapsStatus === "idle") {
      attemptLoad();
    }
  }, [sort, hasSearch, gmapsStatus, attemptLoad]);

  // Harita hazır mı?
  useEffect(() => {
    if (gmapsStatus === "ready" && mapRef.current && !mapReady) {
      setMapReady(true);
    }
  }, [gmapsStatus, mapReady, mapRef]);

  // sort=near ve near yokken, konum izni sor
  useEffect(() => {
    if (sort !== "near") return;
    if (near && typeof near.lat === "number" && typeof near.lng === "number") {
      return;
    }
    if (locationStatus !== "unknown") return;
    requestLocation();
  }, [sort, near, locationStatus, requestLocation]);

  // Harita hazırken, near ya da userLocation'a göre merkeze al
  useEffect(() => {
    if (!mapReady || sort !== "near" || hasSearch || !mapRef.current) return;

    try {
      if (near && typeof near.lat === "number" && typeof near.lng === "number") {
        mapRef.current.setCenter({ lat: near.lat, lng: near.lng });
        if (near.zoom && Number.isFinite(near.zoom)) {
          mapRef.current.setZoom(near.zoom);
        }
      } else if (userLocationRef.current) {
        mapRef.current.setCenter(userLocationRef.current);
        mapRef.current.setZoom(14);
      }
    } catch {
      // no-op
    }
  }, [mapReady, sort, hasSearch, mapRef, near]);

  // Harita idle → viewport + near + radius + LS_NEAR/LS_RADIUS + üst katmana bounds
  useEffect(() => {
    if (!mapReady || sort !== "near" || hasSearch || !mapRef.current) return;

    const map = mapRef.current;

    // EMİR 9: idle listener tekilleştirme
    if (
      idleListenerRef.current &&
      typeof idleListenerRef.current.remove === "function"
    ) {
      idleListenerRef.current.remove();
      idleListenerRef.current = null;
    }

    const handleIdle = () => {
      const boundsObj = map.getBounds();
      if (!boundsObj) return;

      const ne = boundsObj.getNorthEast();
      const sw = boundsObj.getSouthWest();
      const bounds = {
        n: ne.lat(),
        s: sw.lat(),
        e: ne.lng(),
        w: sw.lng(),
      };

      if (typeof onViewportChange === "function") {
        onViewportChange(bounds);
      }

      const center = map.getCenter();
      const zoom = map.getZoom();
      if (center) {
        const lat = center.lat();
        const lng = center.lng();
        setNear({
          lat,
          lng,
          zoom: zoom || 13,
        });
      }

      // Yaklaşık yarıçap (km)
      try {
        const dx = Math.abs(bounds.n - bounds.s);
        const dy = Math.abs(bounds.e - bounds.w);
        const approx = Math.sqrt(dx * dx + dy * dy) * 111;
        const r = approx / 2;
        if (Number.isFinite(r) && r > 0) {
          setRadius(r);
        }
      } catch {
        // no-op
      }
    };

    const idleListener = map.addListener("idle", handleIdle);
    idleListenerRef.current = idleListener;

    return () => {
      if (
        idleListenerRef.current &&
        typeof idleListenerRef.current.remove === "function"
      ) {
        idleListenerRef.current.remove();
        idleListenerRef.current = null;
      }
    };
  }, [mapReady, sort, hasSearch, mapRef, onViewportChange]);

  // Harita hareket ettiğinde "Bu alanda ara" CTA'sını göster
  useEffect(() => {
    if (!mapReady || sort !== "near" || hasSearch || !mapRef.current) return;

    const map = mapRef.current;
    const handleInteraction = () => {
      setShowSearchAreaButton(true);
    };

    // EMİR 9: drag/zoom listener tekilleştirme
    if (
      dragListenerRef.current &&
      typeof dragListenerRef.current.remove === "function"
    ) {
      dragListenerRef.current.remove();
      dragListenerRef.current = null;
    }
    if (
      zoomListenerRef.current &&
      typeof zoomListenerRef.current.remove === "function"
    ) {
      zoomListenerRef.current.remove();
      zoomListenerRef.current = null;
    }

    const dragListener = map.addListener("dragend", handleInteraction);
    const zoomListener = map.addListener("zoom_changed", handleInteraction);

    dragListenerRef.current = dragListener;
    zoomListenerRef.current = zoomListener;

    return () => {
      if (
        dragListenerRef.current &&
        typeof dragListenerRef.current.remove === "function"
      ) {
        dragListenerRef.current.remove();
        dragListenerRef.current = null;
      }
      if (
        zoomListenerRef.current &&
        typeof zoomListenerRef.current.remove === "function"
      ) {
        zoomListenerRef.current.remove();
        zoomListenerRef.current = null;
      }
    };
  }, [mapReady, sort, hasSearch, mapRef]);

  // sort değişince veya arama moduna geçince CTA'yı gizle
  useEffect(() => {
    if (sort !== "near" || hasSearch) {
      setShowSearchAreaButton(false);
    }
  }, [sort, hasSearch]);

  // near + radius → LocalStorage (throttle)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sort !== "near") return;
    if (!near || typeof near.lat !== "number" || typeof near.lng !== "number") {
      return;
    }

    const center = { lat: near.lat, lng: near.lng };
    const zoom = Number(near.zoom || 13);
    const lastCenter = nearPersistRef.current.lastCenter;
    const lastZoom = nearPersistRef.current.lastZoom;

    let shouldSchedule = false;

    if (!lastCenter || !Number.isFinite(lastZoom)) {
      shouldSchedule = true;
    } else {
      const dist = distanceMeters(lastCenter, center);
      const zoomDiff = Math.abs(zoom - lastZoom);
      if (dist > 30 || zoomDiff >= 1) {
        shouldSchedule = true;
      }
    }

    if (!shouldSchedule) return;

    if (nearPersistRef.current.timeoutId) {
      clearTimeout(nearPersistRef.current.timeoutId);
      nearPersistRef.current.timeoutId = null;
    }

    const timeoutId = window.setTimeout(() => {
      writeJSON(LS_NEAR, {
        lat: center.lat,
        lng: center.lng,
        zoom,
      });
      if (Number.isFinite(radius) && radius > 0) {
        writeJSON(LS_RADIUS, radius);
      } else {
        writeJSON(LS_RADIUS, null);
      }
      nearPersistRef.current.lastCenter = center;
      nearPersistRef.current.lastZoom = zoom;
      nearPersistRef.current.timeoutId = null;
    }, 1200);

    nearPersistRef.current.timeoutId = timeoutId;
  }, [sort, near, radius]);

  // Marker + cluster yönetimi (nearMapPins) — EMİR 13: artımlı (chunked) pin render
  useEffect(() => {
    if (sort !== "near" || hasSearch) return;
    if (!mapReady || !mapRef.current || typeof window === "undefined") return;

    const map = mapRef.current;

    // Cluster tek instance
    if (!clusterRef.current) {
      clusterRef.current = createCluster(map);
    }

    const itemsSnapshot = Array.isArray(items) ? items.slice() : [];

    // Items boşsa mevcut pinleri temizle ve çık
    if (!itemsSnapshot.length) {
      clearPins({
        cluster: clusterRef.current,
        markersMap: markersRef.current,
      });
      markersRef.current = {};
      // clusterRef.current kalsın, bir sonraki yüklemede kullanılacak
      return;
    }

    const BATCH_SIZE = 50;

    const scheduleIdle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback.bind(window)
        : (cb) =>
            window.setTimeout(
              () => cb({ didTimeout: false, timeRemaining: () => 0 }),
              0
            );

    const cancelIdle =
      typeof window.cancelIdleCallback === "function"
        ? window.cancelIdleCallback.bind(window)
        : (id) => window.clearTimeout(id);

    // Eski batch job'u iptal et
    if (pinChunkStateRef.current.idleId != null) {
      cancelIdle(pinChunkStateRef.current.idleId);
      pinChunkStateRef.current.idleId = null;
    }

    pinChunkStateRef.current.itemsSnapshot = itemsSnapshot;
    pinChunkStateRef.current.batchIndex = 0;

    const handleSelectFromMap = (routeId) => {
      if (!routeId) return;
      if (typeof onSelectRouteFromMap === "function") {
        onSelectRouteFromMap(routeId);
      }
    };

    const processBatch = (deadline) => {
      const state = pinChunkStateRef.current;
      const snapshot = state.itemsSnapshot || [];
      if (!snapshot.length || !clusterRef.current) {
        state.idleId = null;
        return;
      }

      const selectedIdStr = selectedRouteId ? String(selectedRouteId) : null;

      // Her idle diliminde birden fazla batch işleyebilecek ama
      // timeRemaining düşükse erken bırakacak.
      while (state.batchIndex * BATCH_SIZE < snapshot.length) {
        const nextBatchIndex = state.batchIndex + 1;
        const sliceEnd = nextBatchIndex * BATCH_SIZE;
        const slice = snapshot.slice(0, sliceEnd);

        const result = syncPins({
          map,
          cluster: clusterRef.current,
          items: slice,
          selectedId: selectedIdStr,
          markersMap: markersRef.current,
          onSelect: handleSelectFromMap,
        });

        if (result && result.markersMap) {
          markersRef.current = result.markersMap;
        }

        state.batchIndex = nextBatchIndex;

        const shouldYield =
          !deadline ||
          typeof deadline.timeRemaining !== "function" ||
          deadline.timeRemaining() <= 8;

        if (shouldYield) {
          break;
        }
      }

      if (
        state.batchIndex * BATCH_SIZE <
        (state.itemsSnapshot ? state.itemsSnapshot.length : 0)
      ) {
        state.idleId = scheduleIdle(processBatch);
      } else {
        state.idleId = null;
      }
    };

    pinChunkStateRef.current.idleId = scheduleIdle(processBatch);

    return () => {
      const state = pinChunkStateRef.current;
      if (state.idleId != null) {
        cancelIdle(state.idleId);
        state.idleId = null;
      }
    };
  }, [
    items,
    sort,
    hasSearch,
    mapReady,
    mapRef,
    selectedRouteId,
    onSelectRouteFromMap,
  ]);

  // near modundan çıkınca marker/cluster temizle
  useEffect(() => {
    if (sort === "near" && !hasSearch) return;

    clearPins({
      cluster: clusterRef.current,
      markersMap: markersRef.current,
    });
    clusterRef.current = null;
    markersRef.current = {};
  }, [sort, hasSearch]);

  const handleSearchInThisArea = useCallback(() => {
    setShowSearchAreaButton(false);
    if (typeof onSearchArea === "function") {
      onSearchArea();
    }
  }, [onSearchArea]);

  // Unmount temizliği
  useEffect(() => {
    const persistState = nearPersistRef.current;

    return () => {
      // Chunk job iptali
      if (typeof window !== "undefined") {
        const id = pinChunkStateRef.current.idleId;
        if (id != null) {
          if (typeof window.cancelIdleCallback === "function") {
            window.cancelIdleCallback(id);
          } else {
            clearTimeout(id);
          }
          pinChunkStateRef.current.idleId = null;
        }
      }

      clearPins({
        cluster: clusterRef.current,
        markersMap: markersRef.current,
      });
      clusterRef.current = null;
      markersRef.current = {};

      if (persistState.timeoutId) {
        clearTimeout(persistState.timeoutId);
        persistState.timeoutId = null;
      }

      if (
        idleListenerRef.current &&
        typeof idleListenerRef.current.remove === "function"
      ) {
        idleListenerRef.current.remove();
        idleListenerRef.current = null;
      }
      if (
        dragListenerRef.current &&
        typeof dragListenerRef.current.remove === "function"
      ) {
        dragListenerRef.current.remove();
        dragListenerRef.current = null;
      }
      if (
        zoomListenerRef.current &&
        typeof zoomListenerRef.current.remove === "function"
      ) {
        zoomListenerRef.current.remove();
        zoomListenerRef.current = null;
      }
    };
  }, []);

  return {
    mapDivRef,
    mapRef,
    gmapsStatus,
    errorMsg,
    mapReady,
    near,
    setNear,
    radius,
    setRadius,
    locationStatus,
    requestLocation,
    showSearchAreaButton,
    handleSearchInThisArea,
  };
}
