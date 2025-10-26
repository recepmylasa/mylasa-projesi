// src/MapMobile.js — TAM DOSYA (Cluster + Reverse Geocoding + Rota Kaydı MVP)
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { auth, db } from "./firebase";
import { doc, onSnapshot, updateDoc, setDoc } from "firebase/firestore";

import { useGoogleMaps } from "./hooks/useGoogleMaps";
import { useMarkers } from "./hooks/useMarkers";

import {
  DEFAULT_CENTER, MOBILE_ZOOM, MAP_TYPES,
  SELECTED_MARKER_KEY, SELF_MARKER_KEY,
  MIN_FAB_BOTTOM, FAB_EXTRA_LIFT, containerStyle, FALLBACK_STYLE,
} from "./constants/map";

import { animateFlyTo, distanceMeters } from "./utils/anim";
import {
  PANEL_NONE, PANEL_SEARCH, PANEL_LAYERS, PANEL_SETTINGS,
  initialPanelsState, panelsReducer
} from "./store/panels";

import MapTopControls from "./components/MapTopControls";
import MapTypeMenu from "./components/MapTypeMenu";
import SearchOverlay from "./components/SearchOverlay";

import AvatarModal from "./AvatarModal";
import MapSettingsModal from "./MapSettingsModal";
import NewCheckInDetailMobile from "./NewCheckInDetailMobile";
import { LocateIcon } from "./icons";
import { subscribeFriendLocations } from "./services/locationStream";
import { createClusterer } from "./services/clusterer";
import { reverseGeocode } from "./services/reverseGeocode";

// === ROTA: yeni servisler ===
import { routeRecorder } from "./services/routeRecorder";
import * as routeStore from "./services/routeStore";

// ---- Sabitler
const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID  = (process.env.REACT_APP_GMAPS_MAP_ID || "").trim();
const CHECKIN_RADIUS_M = 500; // ← menzil

// Cluster politikası
const CLUSTER_ZOOM_THRESHOLD = 15; // < 15 → cluster açık, ≥ 15 → kapalı

// Kısa adres güncelleme eşiği
const SELF_ADDR_DISTANCE_THRESHOLD_M = 120; // 120 m hareket etmeden reverse geocode çağırma

// Toast ayarları
const TOAST_LIFETIME_MS = 2600;
const TOAST_COOLDOWN_MS = 15000;

// DEV log temizliği
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const _warn = console.warn;
  console.warn = (...args) => {
    const first = args && args[0] ? String(args[0]) : "";
    if (
      /google\.maps\.Marker is deprecated/i.test(first) ||
      /places\.AutocompleteService is not available to new customers/i.test(first) ||
      /places\.PlacesService is not available to new customers/i.test(first)
    ) return;
    _warn(...args);
  };
}

// friends entegrasyonu: varsayılan props ekledik (geri uyumlu)
export default function MapMobile({ currentUserProfile, friendsUids = [], friendsMeta = {} }) {
  const [{ overlay }, dispatchPanels] = useReducer(panelsReducer, initialPanelsState);

  const [selfAvatarUrl, setSelfAvatarUrl] = useState("/avatars/avatar 1.png");
  const [batteryLevel, setBatteryLevel]   = useState(null);
  const [headingDeg, setHeadingDeg]       = useState(null);

  const [userLocation, setUserLocation]   = useState(null);
  const [firstFixDone, setFirstFixDone]   = useState(false);
  const [userMovedMap, setUserMovedMap]   = useState(false);
  const [fabBottom, setFabBottom]         = useState(MIN_FAB_BOTTOM);

  // Kısa adres durumları
  const [selfShortAddr, setSelfShortAddr] = useState("");          // Ben
  const [placeShortAddr, setPlaceShortAddr] = useState("");        // Seçili yer (kısa)

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isCheckInOpen,   setIsCheckInOpen]   = useState(false);
  const [selectedPlace,   setSelectedPlace]   = useState(null);

  const [searchText, setSearchText]       = useState("");
  const [predictions, setPredictions]     = useState([]);
  const [inputWidth, setInputWidth]       = useState(220);
  const sizerRef = useRef(null);

  // alt-sol toast
  const [rangeToast, setRangeToast] = useState(false);
  const toastStateRef = useRef({ lastAt: 0, hideTimer: null });
  const showRangeToast = useCallback(() => {
    const now = Date.now();
    if (now - toastStateRef.current.lastAt < TOAST_COOLDOWN_MS) return; // cooldown
    toastStateRef.current.lastAt = now;
    setRangeToast(true);
    if (toastStateRef.current.hideTimer) clearTimeout(toastStateRef.current.hideTimer);
    toastStateRef.current.hideTimer = setTimeout(() => setRangeToast(false), TOAST_LIFETIME_MS);
  }, []);
  useEffect(() => () => {
    if (toastStateRef.current.hideTimer) clearTimeout(toastStateRef.current.hideTimer);
  }, []);

  const {
    gmapsStatus, errorMsg,
    mapDivRef, mapRef, advancedAllowedRef,
    autocompleteServiceRef, placesServiceRef, sessionTokenRef,
    attemptLoad,
  } = useGoogleMaps({ API_KEY, MAP_ID });

  useEffect(() => { attemptLoad(false); }, [attemptLoad]);

  const { upsertMarker, removeMarker, selfUIRef } = useMarkers(mapRef, advancedAllowedRef);

  // dış tık kapama için ref'ler
  const searchBtnRef   = useRef(null);
  const layersBtnRef   = useRef(null);
  const settingsBtnRef = useRef(null);
  const searchPanelRef = useRef(null);
  const layersMenuRef  = useRef(null);

  // --- Arkadaş Marker Havuzu (yalnız mobil)
  /** @type {React.MutableRefObject<Map<string, any>>} */
  const friendMarkersRef = useRef(new Map());
  const stopFriendsRef = useRef(null);

  // --- Cluster controller
  const clusterCtrlRef = useRef(null);

  // === ROTA: durumlar
  const [routeStatus, setRouteStatus] = useState("idle"); // idle | recording | finishing
  const activeRouteIdRef = useRef(null);
  const lastSyncedIndexRef = useRef(0);
  const polylineRef = useRef(null);

  // Arkadaş marker HTML içeriği (AdvancedMarker) — sadece avatar
  const createFriendEl = useCallback((avatarUrl, title) => {
    const wrap = document.createElement("div");
    wrap.style.width = "44px";
    wrap.style.height = "44px";
    wrap.style.borderRadius = "50%";
    wrap.style.overflow = "hidden";
    wrap.style.boxShadow = "0 4px 10px rgba(0,0,0,.35)";
    wrap.style.border = "2px solid #fff";
    wrap.style.background = "#f3f4f6";
    wrap.style.transform = "translateY(-2px)";
    wrap.title = title || "";
    const img = document.createElement("img");
    img.src = avatarUrl || "/avatars/avatar 1.png";
    img.alt = title || "Arkadaş";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    wrap.appendChild(img);
    return wrap;
  }, []);

  // Arkadaş marker oluştur / güncelle
  const upsertFriendMarker = useCallback((uid, pos, meta = {}) => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const m = friendMarkersRef.current.get(uid);
    const avatarUrl = meta.avatarUrl || "/avatars/avatar 1.png";
    const title = meta.displayName ? String(meta.displayName) : "Arkadaş";

    if (m) {
      try { m.setPosition?.(pos); } catch {}
      return m;
    }

    let marker = null;
    try {
      if (advancedAllowedRef.current && window.google?.maps?.marker?.AdvancedMarkerElement) {
        const el = createFriendEl(avatarUrl, title);
        marker = new window.google.maps.marker.AdvancedMarkerElement({
          position: pos,
          map,
          content: el,
          title,
          zIndex: 10,
        });
      } else {
        // Fallback: klasik Marker
        marker = new window.google.maps.Marker({
          position: pos,
          map,
          title,
          icon: {
            url: avatarUrl,
            scaledSize: new window.google.maps.Size(44, 44),
          },
          zIndex: 10,
        });
      }
    } catch {
      // Son çare: basit default marker
      try {
        marker = new window.google.maps.Marker({ position: pos, map, title, zIndex: 10 });
      } catch {}
    }

    if (marker) friendMarkersRef.current.set(uid, marker);
    return marker;
  }, [advancedAllowedRef, mapRef, createFriendEl]);

  // Arkadaş marker temizliği
  const removeFriendMarker = useCallback((uid) => {
    const m = friendMarkersRef.current.get(uid);
    if (!m) return;
    try { m.setMap?.(null); } catch {}
    friendMarkersRef.current.delete(uid);
  }, []);

  const clearAllFriendMarkers = useCallback(() => {
    friendMarkersRef.current.forEach((m) => {
      try { m.setMap?.(null); } catch {}
    });
    friendMarkersRef.current.clear();
  }, []);

  // Cluster kur / yok et (map hazır olduğunda)
  useEffect(() => {
    if (gmapsStatus !== "ready" || !mapRef.current) {
      // Harita yokken cluster'ı kapat
      if (clusterCtrlRef.current) { try { clusterCtrlRef.current.destroy(); } catch {} ; clusterCtrlRef.current = null; }
      return;
    }
    if (!clusterCtrlRef.current) {
      clusterCtrlRef.current = createClusterer(mapRef.current, [], {
        // Clusterer kendi maxZoom'unu bilsin fakat esas kontrol bizde (zoom threshold ile)
        maxZoom: CLUSTER_ZOOM_THRESHOLD - 1,
        gridSize: 60,
      });
    }
    return () => {
      // Bileşen unmount/harita kapanırken temizle
      if (clusterCtrlRef.current) { try { clusterCtrlRef.current.destroy(); } catch {} ; clusterCtrlRef.current = null; }
    };
  }, [gmapsStatus, mapRef]);

  // Cluster güncelleme (zoom veya arkadaş listesi değişince)
  const updateClusters = useCallback(() => {
    const map = mapRef.current;
    const ctrl = clusterCtrlRef.current;
    if (!map || !ctrl) return;

    const zoom = map.getZoom?.() ?? MOBILE_ZOOM;
    // Clustera girecek markerlar: SADECE arkadaş markerları
    const friendMarkers = Array.from(friendMarkersRef.current.values()).filter(Boolean);

    if (zoom < CLUSTER_ZOOM_THRESHOLD) {
      // Cluster AÇIK → bireysel görünümü kapat, cluster'a ver
      friendMarkers.forEach((mk) => { try { mk.setMap?.(null); } catch {} });
      ctrl.setMarkers(friendMarkers);
    } else {
      // Cluster KAPALI → cluster temizle, bireysel görünümü map'e ver
      ctrl.clear();
      friendMarkers.forEach((mk) => { try { mk.setMap?.(map); } catch {} });
    }
  }, [mapRef]);

  // Zoom değişimini izle → clusterı güncelle
  useEffect(() => {
    if (gmapsStatus !== "ready" || !mapRef.current) return;
    const map = mapRef.current;
    const l = map.addListener("zoom_changed", () => {
      try { updateClusters(); } catch {}
    });
    // İlk kurulumda bir kez dengele
    setTimeout(() => { try { updateClusters(); } catch {} }, 0);
    return () => { try { l?.remove?.(); } catch {} };
  }, [gmapsStatus, mapRef, updateClusters]);

  // Friends canlı akışı: subscribe + marker güncellemeleri (cluster ile entegre)
  useEffect(() => {
    // Harita hazır değilse, açık akış varsa kapat ve markerları temizle
    if (gmapsStatus !== "ready" || !mapRef.current) {
      if (stopFriendsRef.current) { try { stopFriendsRef.current(); } catch {} ; stopFriendsRef.current = null; }
      clearAllFriendMarkers();
      // Cluster'ı da sıfırla
      if (clusterCtrlRef.current) { try { clusterCtrlRef.current.clear(); } catch {} }
      return;
    }

    // Boş liste: temizle
    if (!Array.isArray(friendsUids) || friendsUids.length === 0) {
      if (stopFriendsRef.current) { try { stopFriendsRef.current(); } catch {} ; stopFriendsRef.current = null; }
      clearAllFriendMarkers();
      if (clusterCtrlRef.current) { try { clusterCtrlRef.current.clear(); } catch {} }
      return;
    }

    // Yeniden kur
    if (stopFriendsRef.current) { try { stopFriendsRef.current(); } catch {} ; stopFriendsRef.current = null; }
    const unsub = subscribeFriendLocations(friendsUids, (points) => {
      try {
        const seen = new Set();
        for (const p of points) {
          if (!p || typeof p.uid !== "string" || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
          seen.add(p.uid);
          const meta = friendsMeta && typeof friendsMeta === "object" ? (friendsMeta[p.uid] || {}) : {};
          upsertFriendMarker(p.uid, { lat: p.lat, lng: p.lng }, meta);
        }
        // Listede olmayan markerları temizle (veya friendsUids dışındakileri)
        friendMarkersRef.current.forEach((_marker, uid) => {
          if (!seen.has(uid) || !friendsUids.includes(uid)) removeFriendMarker(uid);
        });

        // Arkadaş markerları güncellendi → clusterı yeniden hesapla
        updateClusters();
      } catch {
        // Sessiz düş
      }
    }, { throttleMs: 100 });

    stopFriendsRef.current = () => { try { unsub(); } catch {} };
    // İlk state’te de dengele
    setTimeout(() => { try { updateClusters(); } catch {} }, 0);

    return () => {
      try { unsub(); } catch {}
    };
  }, [gmapsStatus, mapRef, friendsUids, friendsMeta, upsertFriendMarker, removeFriendMarker, clearAllFriendMarkers, updateClusters]);

  // MAP: kullanıcı etkileşimi ve boşluğa tıkta paneli kapat
  useEffect(() => {
    if (gmapsStatus !== "ready" || !mapRef.current) return;
    const map = mapRef.current;

    const onClick = (e) => {
      try {
        if (e.placeId) {
          e.stop && e.stop(); // Google varsayılan InfoWindow'u durdur
          const svc = placesServiceRef.current;
          if (!svc) return;
          svc.getDetails(
            { placeId: e.placeId, fields: ["place_id", "name", "geometry", "formatted_address"], sessionToken: sessionTokenRef.current },
            (place, status) => {
              const ok = window.google.maps.places.PlacesServiceStatus.OK;
              if (status !== ok || !place?.geometry?.location) return;
              const pos = {
                lat: typeof place.geometry.location.lat === "function" ? place.geometry.location.lat() : place.geometry.location.lat,
                lng: typeof place.geometry.location.lng === "function" ? place.geometry.location.lng() : place.geometry.location.lng,
              };
              setSelectedPlace({
                id: place.place_id, name: place.name, lat: pos.lat, lng: pos.lng,
                address: place.formatted_address || "",
              });
              setPlaceShortAddr(""); // yeni yer için kısa adresi sonra hesaplayacağız
              upsertMarker(SELECTED_MARKER_KEY, pos, { title: place.name });
              showRangeToast(); // sadece etkileşimde ve cooldown'lı
            }
          );
          return;
        }
      } catch {}
      // Boş tık: kapat
      setSelectedPlace(null);
      setPlaceShortAddr("");
      removeMarker(SELECTED_MARKER_KEY);
    };

    const onDragStart = () => setUserMovedMap(true);

    const clickL = map.addListener("click", onClick);
    const dragL  = map.addListener("dragstart", onDragStart);

    return () => { clickL?.remove?.(); dragL?.remove?.(); };
  }, [gmapsStatus, mapRef, placesServiceRef, sessionTokenRef, upsertMarker, removeMarker, showRangeToast]);

  // dış tık & ESC (UI panelleri)
  useEffect(() => {
    const onPointerDown = (e) => {
      if (overlay === PANEL_NONE) return;
      const t = e.target;
      const insideSearch = (searchPanelRef.current && searchPanelRef.current.contains(t)) ||
                           (searchBtnRef.current && searchBtnRef.current.contains(t));
      const insideLayers = (layersMenuRef.current && layersMenuRef.current.contains(t)) ||
                           (layersBtnRef.current && layersBtnRef.current.contains(t));
      const insideSettingsBtn = (settingsBtnRef.current && settingsBtnRef.current.contains(t));
      if (insideSearch || insideLayers || insideSettingsBtn) return;
      dispatchPanels({ type: "CLOSE_ALL" });
      setPredictions([]); setSearchText("");
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape" && overlay !== PANEL_NONE) {
        dispatchPanels({ type: "CLOSE_ALL" });
        setPredictions([]); setSearchText("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [overlay]);

  // input genişliği ölçüm
  const measureInput = useCallback(() => {
    try {
      const baseMin = 220;
      const maxW = Math.min(Math.max(window.innerWidth - 48, 280), 560);
      const sizer = sizerRef.current;
      if (!sizer) { setInputWidth(baseMin); return; }
      sizer.textContent = (searchText && searchText.length > 0 ? searchText : "Yer ara…");
      const w = Math.ceil(sizer.offsetWidth) + 80;
      setInputWidth(Math.max(baseMin, Math.min(maxW, w)));
    } catch { setInputWidth(220); }
  }, [searchText]);

  const isSearchOpen = overlay === PANEL_SEARCH;
  useEffect(() => { if (isSearchOpen) measureInput(); }, [isSearchOpen, measureInput]);
  useEffect(() => {
    const onRes = () => { if (isSearchOpen) measureInput(); };
    window.addEventListener("resize", onRes);
    window.addEventListener("orientationchange", onRes);
    return () => {
      window.removeEventListener("resize", onRes);
      window.removeEventListener("orientationchange", onRes);
    };
  }, [isSearchOpen, measureInput]);

  // FAB konumu
  useEffect(() => {
    function measure() {
      let h = 0;
      const knownSel = [".bottom-nav","nav.bottom-nav","#bottom-nav","[data-bottom-nav]",
        ".BottomNav",'div[class*="BottomNav"]','div[class*="bottom-nav"]','div[class*="bottomNav"]'];
      knownSel.forEach((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const r = el.getBoundingClientRect(); h = Math.max(h, r.height);
      });
      const all = Array.from(document.body.getElementsByTagName("*"));
      for (const el of all) {
        const cs = window.getComputedStyle(el);
        if (cs.position !== "fixed") continue;
        const r = el.getBoundingClientRect();
        if (r.bottom >= window.innerHeight - 1) h = Math.max(h, Math.min(r.height, 280));
      }
      if (h === 0) h = 84;
      setFabBottom(Math.max(h + 36, MIN_FAB_BOTTOM));
    }
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    setTimeout(measure, 0);
    setTimeout(measure, 300);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // profil: avatar
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const unsub = onSnapshot(doc(db, "users", u.uid), (snap) => {
      const d = snap.data() || {};
      if (d.avatarUrl) setSelfAvatarUrl(d.avatarUrl);
    });
    return () => unsub && unsub();
  }, []);

  // Pil
  useEffect(() => {
    let bat = null;
    function onChange() { try { setBatteryLevel(bat.level); } catch {} }
    if (navigator && typeof navigator.getBattery === "function") {
      navigator.getBattery().then((b) => {
        bat = b;
        setBatteryLevel(b.level);
        b.addEventListener("levelchange", onChange);
      }).catch(() => {});
    }
    return () => { try { bat && bat.removeEventListener("levelchange", onChange); } catch {} };
  }, []);

  // Pusula
  useEffect(() => {
    let handler = null;
    const start = () => {
      handler = (e) => {
        let h = null;
        if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
        else if (typeof e.alpha === "number") h = (360 - e.alpha);
        if (h != null && !Number.isNaN(h)) setHeadingDeg(((h % 360) + 360) % 360);
      };
      window.addEventListener("deviceorientation", handler, true);
    };
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === "function") {
      const ask = () => {
        D.requestPermission().then((state) => { if (state === "granted") start(); }).catch(() => {});
        window.removeEventListener("click", ask); window.removeEventListener("touchend", ask);
      };
      window.addEventListener("click", ask, { once: true });
      window.addEventListener("touchend", ask, { once: true });
    } else if ("DeviceOrientationEvent" in window) { start(); }
    return () => { if (handler) window.removeEventListener("deviceorientation", handler, true); };
  }, []);

  // === ROTA: polyline oluştur/temizle
  const createPolyline = useCallback(() => {
    if (!mapRef.current || !window.google?.maps || polylineRef.current) return;
    try {
      polylineRef.current = new window.google.maps.Polyline({
        map: mapRef.current,
        clickable: false,
        strokeColor: "#1a73e8",
        strokeOpacity: 0.95,
        strokeWeight: 4,
        geodesic: true,
      });
    } catch {}
  }, [mapRef]);

  const clearPolyline = useCallback(() => {
    try {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    } catch {}
  }, []);

  // Harita yeniden hazır olduğunda polyline'ı map'e bağla (kayıt sürüyorsa)
  useEffect(() => {
    if (gmapsStatus === "ready" && routeStatus === "recording" && polylineRef.current) {
      try { polylineRef.current.setMap(mapRef.current); } catch {}
    }
  }, [gmapsStatus, routeStatus, mapRef]);

  // Konum (watch)
  useEffect(() => {
    if (gmapsStatus !== "ready") return;
    const geoOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    const onPos = (position) => {
      const user = auth.currentUser;
      const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
      setUserLocation(loc);

      if (mapRef.current) {
        if (!firstFixDone || !userMovedMap) {
          try { mapRef.current.setCenter(loc); mapRef.current.setZoom(MOBILE_ZOOM); } catch {}
        }
      }
      if (!firstFixDone) setFirstFixDone(true);

      if (user && currentUserProfile?.isSharing !== false) {
        const locationRef = doc(db, "locations", user.uid);
        updateDoc(locationRef, { longitude: loc.lng, latitude: loc.lat, timestamp: new Date() })
          .catch(() => { setDoc(locationRef, { longitude: loc.lng, latitude: loc.lat, timestamp: new Date() }); });
      }

      // === ROTA: kayıt aktifse noktayı ekle ve artımlı yaz
      if (routeStatus === "recording" && activeRouteIdRef.current) {
        try {
          routeRecorder.onPoint(loc.lat, loc.lng, Date.now());

          // Polyline'a sadece yeni noktaları ekle
          const path = routeRecorder.getPath();
          const start = lastSyncedIndexRef.current || 0;
          const newChunk = path.slice(start);
          if (newChunk.length) {
            // harita çizgisi
            try {
              createPolyline();
              const arr = polylineRef.current?.getPath?.();
              if (arr && window.google?.maps) {
                newChunk.forEach(p => arr.push(new window.google.maps.LatLng(p.lat, p.lng)));
              }
            } catch {}

            // Firestore'a artımlı yazım (async, beklemeden)
            routeStore.appendPath(activeRouteIdRef.current, newChunk).catch(() => {});
            lastSyncedIndexRef.current = path.length;
          }
        } catch {}
      }

      // *** ÖNEMLİ: Burada toast YOK (tekrarlamayı engelledik) ***
    };
    const onErr = () => setUserLocation(null);

    navigator.geolocation.getCurrentPosition(onPos, onErr, geoOptions);
    const watchId = navigator.geolocation.watchPosition(onPos, onErr, geoOptions);
    return () => { try { navigator.geolocation.clearWatch(watchId); } catch {} };
  }, [gmapsStatus, currentUserProfile?.isSharing, firstFixDone, userMovedMap, mapRef, routeStatus, createPolyline]);

  // İlk GPS fix alındığında bir kez tost göster
  useEffect(() => {
    if (firstFixDone) showRangeToast();
  }, [firstFixDone, showRangeToast]);

  // Kendi marker'ı yerleştir/güncelle (SELF clustera dahil edilmez)
  useEffect(() => {
    if (gmapsStatus !== "ready") return;
    if (userLocation) {
      upsertMarker(SELF_MARKER_KEY, userLocation, {
        title: "Konumun",
        avatarUrl: selfAvatarUrl,
        heightPx: 68,
        isSelf: true,
        selfName: "Ben",
        batteryLevel,
        headingDeg,
        onClick: () => setIsAvatarModalOpen(true),
      });
    } else {
      removeMarker(SELF_MARKER_KEY);
    }
  }, [gmapsStatus, userLocation, selfAvatarUrl, batteryLevel, headingDeg, upsertMarker, removeMarker]);

  // Canlı UI (batarya, %, koni)
  useEffect(() => {
    const { cone, nameSpan, fill, pct } = selfUIRef.current || {};
    if (nameSpan) nameSpan.textContent = "Ben";

    if (fill) {
      const level = batteryLevel == null ? 1 : Math.max(0, Math.min(1, batteryLevel));
      fill.style.width = batteryLevel == null ? "100%" : `${Math.max(3, Math.round(level * 100))}%`;
      fill.style.opacity = batteryLevel == null ? "0.55" : "1";
      fill.style.background = batteryLevel == null ? "#888" : (level > 0.5 ? "#16a34a" : level > 0.2 ? "#d97706" : "#ef4444");
    }
    if (pct) {
      pct.textContent = (batteryLevel == null) ? "—" : `${Math.round((batteryLevel || 0) * 100)}%`;
    }
    if (cone) {
      cone.style.display = headingDeg == null ? "none" : "block";
      if (headingDeg != null) cone.style.transform = `translate(-50%, -6px) rotate(${headingDeg}deg)`;
    }
  }, [batteryLevel, headingDeg, selfUIRef]);

  // Autocomplete
  useEffect(() => {
    const isSearchOpen = overlay === PANEL_SEARCH;
    if (!isSearchOpen || gmapsStatus !== "ready") return;
    if (!searchText.trim()) { setPredictions([]); return; }

    const svc = autocompleteServiceRef.current;
    const token = sessionTokenRef.current;
    if (!svc || !token) return;

    const h = setTimeout(() => {
      svc.getPlacePredictions(
        { input: searchText, sessionToken: token, componentRestrictions: { country: ["tr"] }, types: ["establishment", "geocode"] },
        (res, status) => {
          const ok = window.google.maps.places.PlacesServiceStatus.OK;
          if (status !== ok || !res) { setPredictions([]); return; }
          setPredictions(res);
        }
      );
    }, 300);
    return () => clearTimeout(h);
  }, [searchText, overlay, gmapsStatus, autocompleteServiceRef, sessionTokenRef]);

  const handleSelectPrediction = useCallback((pred) => {
    const svc = placesServiceRef.current;
    const token = sessionTokenRef.current;
    if (!svc) return;

    svc.getDetails(
      { placeId: pred.place_id, fields: ["place_id", "name", "geometry", "formatted_address"], sessionToken: token },
      (place, status) => {
        const ok = window.google.maps.places.PlacesServiceStatus.OK;
        if (status !== ok || !place || !place.geometry?.location) return;

        const pos = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
        setSelectedPlace({ id: place.place_id, name: place.name, lat: pos.lat, lng: pos.lng, address: place.formatted_address || "" });
        setPlaceShortAddr(""); // yeni yer için kısa adresi sonra hesaplayacağız

        try {
          const map = mapRef.current;
          const cur = map.getCenter()?.toJSON?.() || DEFAULT_CENTER;
          const z   = map.getZoom?.() ?? MOBILE_ZOOM;
          // Not: animasyon politikasında değişiklik yok (MVP), mevcut fonksiyonla
          animateFlyTo(map, cur, pos, z, 17, 900);
        } catch {}
        upsertMarker(SELECTED_MARKER_KEY, pos, { title: place.name });

        setPredictions([]); dispatchPanels({ type: "CLOSE_ALL" }); setSearchText("");
        try { sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken(); } catch {}

        showRangeToast(); // cooldown'lı
      }
    );
  }, [placesServiceRef, sessionTokenRef, mapRef, upsertMarker, dispatchPanels, showRangeToast]);

  // seçili yer için kısa adresi doldur (adres yoksa da reverse geocode ile al)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!selectedPlace) { setPlaceShortAddr(""); return; }
        const { lat, lng } = selectedPlace || {};
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) { setPlaceShortAddr(""); return; }
        const short = await reverseGeocode(lat, lng);
        if (!cancelled) setPlaceShortAddr(short || "");
      } catch {
        if (!cancelled) setPlaceShortAddr("");
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPlace]);

  // Kendi konumu için kısa adres (120 m hareket eşiği ile)
  const lastAddrLocRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!userLocation) { setSelfShortAddr(""); lastAddrLocRef.current = null; return; }
        const prev = lastAddrLocRef.current;
        if (prev) {
          const d = distanceMeters(prev, userLocation);
          if (d < SELF_ADDR_DISTANCE_THRESHOLD_M) return; // çok yakında, çağırmaya gerek yok
        }
        lastAddrLocRef.current = userLocation;
        const short = await reverseGeocode(userLocation.lat, userLocation.lng);
        if (!cancelled && short) setSelfShortAddr(short);
      } catch {
        if (!cancelled) setSelfShortAddr("");
      }
    })();
    return () => { cancelled = true; };
  }, [userLocation]);

  // seçili yer için uzaklık
  const selectedDist = useMemo(() => {
    if (!selectedPlace || !userLocation) return null;
    return Math.round(distanceMeters(userLocation, { lat: selectedPlace.lat, lng: selectedPlace.lng }));
  }, [selectedPlace, userLocation]);

  const inRange = selectedDist != null && selectedDist <= CHECKIN_RADIUS_M;

  // === ROTA: UI Aksiyonları
  const handleStartRoute = useCallback(async () => {
    if (routeStatus !== "idle") return;
    try {
      const ownerId = auth.currentUser?.uid || "";
      const title = `Rota ${new Date().toLocaleTimeString("tr-TR")}`;
      routeRecorder.start({ title, visibility: "public" });
      setRouteStatus("recording");
      const routeId = await routeStore.createRoute({ ownerId, title, visibility: "public" });
      activeRouteIdRef.current = routeId;
      lastSyncedIndexRef.current = 0;
      createPolyline();

      // İlk nokta mevcutsa hemen kaydet
      if (userLocation) {
        routeRecorder.onPoint(userLocation.lat, userLocation.lng, Date.now());
        const p = routeRecorder.getPath();
        if (p.length) {
          try {
            const arr = polylineRef.current?.getPath?.();
            if (arr && window.google?.maps) {
              arr.push(new window.google.maps.LatLng(userLocation.lat, userLocation.lng));
            }
          } catch {}
          routeStore.appendPath(routeId, p).catch(() => {});
          lastSyncedIndexRef.current = p.length;
        }
      }
    } catch {
      setRouteStatus("idle");
      activeRouteIdRef.current = null;
      clearPolyline();
    }
  }, [routeStatus, userLocation, createPolyline, clearPolyline]);

  const handleAddStop = useCallback(async () => {
    if (routeStatus !== "recording" || !activeRouteIdRef.current || !userLocation) return;
    const defaultTitle = `Durak ${Date.now() % 10000}`;
    const title = window.prompt("Durak başlığı", defaultTitle);
    if (title == null) return; // iptal
    const note = window.prompt("Not (opsiyonel)", "") || "";
    try {
      const stop = routeRecorder.addStop({ title, note, lat: userLocation.lat, lng: userLocation.lng, t: Date.now() });
      if (stop) await routeStore.addStop(activeRouteIdRef.current, stop);
    } catch {}
  }, [routeStatus, userLocation]);

  const handleFinishRoute = useCallback(async () => {
    if (routeStatus !== "recording" || !activeRouteIdRef.current) return;
    setRouteStatus("finishing");
    try {
      // Gönderilmemiş path varsa yaz
      const full = routeRecorder.getPath();
      const start = lastSyncedIndexRef.current || 0;
      const remain = full.slice(start);
      if (remain.length) await routeStore.appendPath(activeRouteIdRef.current, remain);

      const stats = routeRecorder.finish(); // recorder sıfırlanır
      if (stats) await routeStore.finishRoute(activeRouteIdRef.current, stats);
    } catch {}
    finally {
      activeRouteIdRef.current = null;
      lastSyncedIndexRef.current = 0;
      clearPolyline();
      setRouteStatus("idle");
    }
  }, [routeStatus, clearPolyline]);

  // Render
  if (gmapsStatus === "no-key") {
    return (
      <div style={FALLBACK_STYLE}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Harita yapılandırması eksik</div>
        <div style={{ maxWidth: 520, opacity: 0.85 }}>
          <code>.env</code> dosyasında <code>REACT_APP_GOOGLE_MAPS_API_KEY</code> bulunamadı.
          Sunucuyu durdurup yeniden başlat.
        </div>
      </div>
    );
  }
  if (gmapsStatus === "error") {
    return (
      <div style={FALLBACK_STYLE}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Harita yüklenemedi</div>
        <div style={{ maxWidth: 520, opacity: 0.85 }}>{errorMsg || "Beklenmeyen bir hata oluştu."}</div>
        <button onClick={() => attemptLoad(true)} style={{ marginTop: 8, padding: "10px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>
          Tekrar dene
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <style>{`
        .mylasa-search-input::placeholder { color: rgba(255,255,255,0.8); }
        .mylasa-search-scroll::-webkit-scrollbar { width: 6px; }
        .mylasa-search-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 4px; }
      `}</style>

      {/* üst bar */}
      <MapTopControls
        selfAvatarUrl={selfAvatarUrl}
        onOpenAvatar={() => setIsAvatarModalOpen(true)}
        onToggleSettings={() => dispatchPanels({ type: "TOGGLE", payload: PANEL_SETTINGS })}
        onToggleLayers={() => dispatchPanels({ type: "TOGGLE", payload: PANEL_LAYERS })}
        onToggleSearch={() => {
          dispatchPanels({ type: "TOGGLE", payload: PANEL_SEARCH });
          setSearchText(""); setPredictions([]);
          setTimeout(() => { const evt = new Event("resize"); window.dispatchEvent(evt); }, 0);
        }}
        searchBtnRef={searchBtnRef} layersBtnRef={layersBtnRef} settingsBtnRef={settingsBtnRef}
      />

      {/* katman menüsü */}
      <div style={{ position: "absolute", top: "70px", right: "10px", zIndex: 20 }}>
        <MapTypeMenu
          open={overlay === PANEL_LAYERS}
          mapTypes={MAP_TYPES}
          onSelect={(type) => { try { mapRef.current?.setMapTypeId?.(type); } catch {} dispatchPanels({ type: "CLOSE_ALL" }); }}
          ref={layersMenuRef}
        />
      </div>

      {/* arama paneli */}
      <SearchOverlay
        open={overlay === PANEL_SEARCH}
        inputWidth={inputWidth}
        searchText={searchText}
        setSearchText={setSearchText}
        predictions={predictions}
        onClose={() => { dispatchPanels({ type: "CLOSE_ALL" }); setSearchText(""); setPredictions([]); }}
        onSelectPrediction={handleSelectPrediction}
        ref={searchPanelRef}
      />
      <span ref={sizerRef} style={{ position: "absolute", visibility: "hidden", whiteSpace: "pre", fontSize: 16, fontFamily: "inherit", fontWeight: 400 }} />

      {/* yer kartı */}
      {selectedPlace && (
        <div style={{
          position: "absolute", top: 56, left: 12, right: 12, zIndex: 22,
          background: "white", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.28)", overflow: "hidden"
        }}>
          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedPlace.name}</div>
            {(placeShortAddr || selectedPlace.address) && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                {placeShortAddr || selectedPlace.address}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#444", marginTop: 6 }}>
              Uzaklık: {selectedDist != null ? `${selectedDist} m` : "—"} — Menzil: {CHECKIN_RADIUS_M / 1000 >= 1 ? `${CHECKIN_RADIUS_M/1000} km` : `${CHECKIN_RADIUS_M} m`} — {inRange ? "Menzil içinde" : "Menzil dışında"}
            </div>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            borderTop: "1px solid #efefef", padding: "8px 10px"
          }}>
            <button
              onClick={() => setIsCheckInOpen(true)}
              disabled={!inRange}
              style={{
                padding: "10px 14px",
                background: inRange ? "#0095f6" : "#d1d5db",
                color: inRange ? "white" : "#555",
                border: "none", borderRadius: 8, fontWeight: 700, cursor: inRange ? "pointer" : "not-allowed"
              }}
              title={inRange ? "Check-in yap" : "Check-in için menzil dışı"}
            >
              {inRange ? "Check-in yap" : "Check-in için menzil dışı"}
            </button>
            <button
              onClick={() => { setSelectedPlace(null); setPlaceShortAddr(""); removeMarker(SELECTED_MARKER_KEY); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
              title="Kapat"
            >✖</button>
          </div>
        </div>
      )}

      {/* Google Map */}
      <div ref={mapDivRef} style={{ width: "100%", height: "100%", paddingBottom: 55 }} />

      {/* BEN için kısa adres chip */}
      {selfShortAddr && (
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 18,
            zIndex: 21,
            pointerEvents: "none",
            background: "rgba(0,0,0,0.68)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 10,
            fontSize: 12,
            boxShadow: "0 6px 16px rgba(0,0,0,.35)",
            maxWidth: 260,
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflow: "hidden"
          }}
          title={selfShortAddr}
        >
          {selfShortAddr}
        </div>
      )}

      {/* alt-sol menzil tostu */}
      <div
        style={{
          position: "absolute",
          left: 14,
          bottom: `calc(${fabBottom + 8}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 21,
          pointerEvents: "none",
          transition: "opacity .2s ease, transform .2s ease",
          opacity: rangeToast ? 1 : 0,
          transform: rangeToast ? "translateY(0)" : "translateY(6px)"
        }}
      >
        <div style={{
          background: "rgba(0,0,0,0.68)",
          color: "#fff",
          padding: "8px 10px",
          borderRadius: 8,
          fontSize: 12,
          boxShadow: "0 6px 16px rgba(0,0,0,.35)",
          maxWidth: 200,
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          overflow: "hidden"
        }}>
          ±{CHECKIN_RADIUS_M} m içinde check-in
        </div>
      </div>

      {/* Sağ-alt Konumuma Git */}
      <button
        style={{
          position: "absolute",
          right: 14,
          bottom: `calc(${fabBottom + FAB_EXTRA_LIFT}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 23,
          width: 56, height: 56, borderRadius: "50%",
          background: "rgba(0,0,0,0.28)",
          border: "0", boxShadow: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer"
        }}
        onClick={() => {
          if (userLocation && mapRef.current) {
            // yer kartı açıksa kapat
            setSelectedPlace(null);
            setPlaceShortAddr("");
            removeMarker(SELECTED_MARKER_KEY);

            try {
              const map = mapRef.current;
              const cur = map.getCenter()?.toJSON?.() || DEFAULT_CENTER;
              const z   = map.getZoom?.() ?? MOBILE_ZOOM;
              // Mevcut politikayla uçuş
              animateFlyTo(map, cur, userLocation, z, MOBILE_ZOOM, 900);
              setUserMovedMap(false);
            } catch {}
          }
          try {
            const D = window.DeviceOrientationEvent;
            if (D && typeof D.requestPermission === "function") D.requestPermission().catch(() => {});
          } catch {}
          // Not: burada toast tetiklemiyoruz
        }}
        title="Konumuma git" aria-label="Konumuma git"
      >
        <LocateIcon size={28} color="#fff" weight="bold" />
      </button>

      {/* === ROTA Mini Panel (Locate'in SOLU) === */}
      <div
        style={{
          position: "absolute",
          right: 82,
          bottom: `calc(${fabBottom + FAB_EXTRA_LIFT}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 23,
          display: "flex",
          gap: 8,
          alignItems: "center"
        }}
      >
        {routeStatus === "idle" && (
          <button
            onClick={handleStartRoute}
            style={{
              height: 40, padding: "0 14px", borderRadius: 20,
              background: "rgba(0,0,0,0.68)", color: "#fff",
              border: "none", fontWeight: 700, cursor: "pointer"
            }}
            title="Rota Başlat"
          >
            Rota Başlat
          </button>
        )}
        {routeStatus !== "idle" && (
          <>
            <button
              onClick={handleAddStop}
              disabled={!userLocation || routeStatus === "finishing"}
              style={{
                height: 40, padding: "0 12px", borderRadius: 20,
                background: "rgba(0,0,0,0.68)", color: "#fff",
                border: "none", fontWeight: 700,
                cursor: routeStatus === "finishing" ? "not-allowed" : "pointer",
                opacity: routeStatus === "finishing" ? 0.65 : 1
              }}
              title="Durak Ekle"
            >
              Durak Ekle
            </button>
            <button
              onClick={handleFinishRoute}
              disabled={routeStatus === "finishing"}
              style={{
                height: 40, padding: "0 12px", borderRadius: 20,
                background: routeStatus === "finishing" ? "#ef4444AA" : "#ef4444",
                color: "#fff", border: "none", fontWeight: 800,
                cursor: routeStatus === "finishing" ? "not-allowed" : "pointer"
              }}
              title="Bitir"
            >
              {routeStatus === "finishing" ? "Bitiriliyor…" : "Bitir"}
            </button>
          </>
        )}
      </div>

      {/* Modallar */}
      {isAvatarModalOpen && <AvatarModal onClose={() => setIsAvatarModalOpen(false)} />}
      {overlay === PANEL_SETTINGS && <MapSettingsModal onClose={() => dispatchPanels({ type: "CLOSE_ALL" })} />}

      {/* Check-in modalı */}
      {isCheckInOpen && selectedPlace && (
        <NewCheckInDetailMobile
          selectedPlace={selectedPlace}
          currentUser={auth.currentUser}
          onClose={() => setIsCheckInOpen(false)}
        />
      )}
    </div>
  );
}
