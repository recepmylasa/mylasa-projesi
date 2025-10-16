// src/MapMobile.js — İNCELTİLMİŞ ANA BİLEŞEN
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

import { animateFlyTo } from "./utils/anim";
import { PANEL_NONE, PANEL_SEARCH, PANEL_LAYERS, PANEL_SETTINGS, initialPanelsState, panelsReducer } from "./store/panels";

import MapTopControls from "./components/MapTopControls";
import MapTypeMenu from "./components/MapTypeMenu";
import SearchOverlay from "./components/SearchOverlay";

import AvatarModal from "./AvatarModal";
import MapSettingsModal from "./MapSettingsModal";
import NewCheckInDetailMobile from "./NewCheckInDetailMobile";
import { LocateIcon } from "./icons";

// ---- DEV gürültü susturma
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const _warn = console.warn;
  console.warn = (...args) => {
    const first = (args && args[0] ? String(args[0]) : "");
    if (
      /google\.maps\.Marker is deprecated/i.test(first) ||
      /places\.AutocompleteService is not available to new customers/i.test(first) ||
      /places\.PlacesService is not available to new customers/i.test(first)
    ) return;
    _warn(...args);
  };
}

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID  = (process.env.REACT_APP_GMAPS_MAP_ID || "").trim();

export default function MapMobile({ currentUserProfile, onUserClick }) {
  // --------- Hook’lar ŞARTSIZ (ESLint OK) ---------
  const [{ overlay }, dispatchPanels] = useReducer(panelsReducer, initialPanelsState);

  const [selfAvatarUrl, setSelfAvatarUrl] = useState("/avatars/avatar 1.png");
  const [selfDisplayName, setSelfDisplayName] = useState("");
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [headingDeg, setHeadingDeg] = useState(null);

  const [userLocation, setUserLocation] = useState(null);
  const [firstFixDone, setFirstFixDone] = useState(false);
  const [userMovedMap, setUserMovedMap] = useState(false);
  const [fabBottom, setFabBottom] = useState(MIN_FAB_BOTTOM);

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [inputWidth, setInputWidth] = useState(220);
  const sizerRef = useRef(null);

  const {
    gmapsStatus, errorMsg,
    mapDivRef, mapRef, advancedAllowedRef,
    autocompleteServiceRef, placesServiceRef, sessionTokenRef,
    attemptLoad,
  } = useGoogleMaps({ API_KEY, MAP_ID });

  useEffect(() => { attemptLoad(false); /* mount */ }, [attemptLoad]);

  const { upsertMarker, removeMarker, selfUIRef } = useMarkers(mapRef, advancedAllowedRef);

  // --- Refs (dışarı tık kapama)
  const searchBtnRef = useRef(null);
  const layersBtnRef = useRef(null);
  const settingsBtnRef = useRef(null);
  const searchPanelRef = useRef(null);
  const layersMenuRef = useRef(null);

  // ---- Overlay dışına tıklayınca/ESC’de kapat
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
      setPredictions([]);
      setSearchText("");
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape" && overlay !== PANEL_NONE) {
        dispatchPanels({ type: "CLOSE_ALL" });
        setPredictions([]);
        setSearchText("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [overlay]);

  // ---- Input genişliği
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

  // ---- FAB mesafesi
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

  // ---- Profil/İsim
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const unsub = onSnapshot(doc(db, "users", u.uid), (snap) => {
      const d = snap.data() || {};
      if (d.avatarUrl) setSelfAvatarUrl(d.avatarUrl);
      const name = d.profileName || d.displayName || d.kullaniciAdi || u.displayName || "Ben";
      setSelfDisplayName(name);
    });
    return () => unsub && unsub();
  }, []);

  // ---- Pil
  useEffect(() => {
    let bat = null;
    if (navigator && typeof navigator.getBattery === "function") {
      navigator.getBattery().then((b) => {
        bat = b;
        setBatteryLevel(b.level);
        b.addEventListener("levelchange", onChange);
      }).catch(() => {});
    }
    function onChange() { try { setBatteryLevel(bat.level); } catch {} }
    return () => { try { bat && bat.removeEventListener("levelchange", onChange); } catch {} };
  }, []);

  // ---- Pusula
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
        D.requestPermission().then((state) => { if (state === "granted") start(); })
          .catch(() => {});
        window.removeEventListener("click", ask);
        window.removeEventListener("touchend", ask);
      };
      window.addEventListener("click", ask, { once: true });
      window.addEventListener("touchend", ask, { once: true });
    } else if ("DeviceOrientationEvent" in window) {
      start();
    }
    return () => { if (handler) window.removeEventListener("deviceorientation", handler, true); };
  }, []);

  // ---- Konum
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
        updateDoc(locationRef, {
          longitude: loc.lng, latitude: loc.lat, timestamp: new Date(),
        }).catch(() => {
          setDoc(locationRef, {
            longitude: loc.lng, latitude: loc.lat, timestamp: new Date(),
          });
        });
      }
    };
    const onErr = () => setUserLocation(null);

    navigator.geolocation.getCurrentPosition(onPos, onErr, geoOptions);
    const watchId = navigator.geolocation.watchPosition(onPos, onErr, geoOptions);
    return () => { try { navigator.geolocation.clearWatch(watchId); } catch {} };
  }, [gmapsStatus, currentUserProfile?.isSharing, firstFixDone, userMovedMap, mapRef]);

  // ---- Kendi marker’ı + canlı UI
  useEffect(() => {
    if (gmapsStatus !== "ready") return;
    if (userLocation) {
      upsertMarker(SELF_MARKER_KEY, userLocation, {
        title: "Konumun",
        avatarUrl: selfAvatarUrl,
        heightPx: 68,
        isSelf: true,
        selfName: selfDisplayName,
        batteryLevel,
        headingDeg,
        onClick: () => setIsAvatarModalOpen(true),
      });
    } else {
      removeMarker(SELF_MARKER_KEY);
    }
  }, [gmapsStatus, userLocation, selfAvatarUrl, selfDisplayName, batteryLevel, headingDeg, upsertMarker, removeMarker]);

  useEffect(() => {
    const { cone, nameSpan, fill, pct } = selfUIRef.current || {};
    if (nameSpan) nameSpan.textContent = selfDisplayName || "Ben";
    if (fill) {
      const level = batteryLevel == null ? 1 : Math.max(0, Math.min(1, batteryLevel));
      fill.style.width = batteryLevel == null ? "100%" : `${Math.max(3, Math.round(level * 100))}%`;
      fill.style.opacity = batteryLevel == null ? "0.55" : "1";
      fill.style.background = batteryLevel == null ? "#888" : (level > 0.5 ? "#16a34a" : level > 0.2 ? "#d97706" : "#ef4444");
    }
    if (pct) pct.textContent = batteryLevel == null ? "—" : `${Math.round((batteryLevel || 0) * 100)}%`;
    if (cone) {
      cone.style.display = headingDeg == null ? "none" : "block";
      if (headingDeg != null) cone.style.transform = `translate(-50%, -6px) rotate(${headingDeg}deg)`;
    }
  }, [selfDisplayName, batteryLevel, headingDeg, selfUIRef]);

  // ---- Autocomplete
  useEffect(() => {
    if (!isSearchOpen || gmapsStatus !== "ready") return;
    if (!searchText.trim()) { setPredictions([]); return; }

    const svc = autocompleteServiceRef.current;
    const token = sessionTokenRef.current;
    if (!svc || !token) return;

    const h = setTimeout(() => {
      svc.getPlacePredictions(
        {
          input: searchText,
          sessionToken: token,
          componentRestrictions: { country: ["tr"] },
          types: ["establishment", "geocode"],
        },
        (res, status) => {
          const ok = window.google.maps.places.PlacesServiceStatus.OK;
          if (status !== ok || !res) { setPredictions([]); return; }
          setPredictions(res);
        }
      );
    }, 300);
    return () => clearTimeout(h);
  }, [searchText, isSearchOpen, gmapsStatus, autocompleteServiceRef, sessionTokenRef]);

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

        try { mapRef.current?.panTo(pos); mapRef.current?.setZoom(17); } catch {}
        upsertMarker(SELECTED_MARKER_KEY, pos, { title: place.name });

        setPredictions([]);
        dispatchPanels({ type: "CLOSE_ALL" });
        setSearchText("");
        try { sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken(); } catch {}
      }
    );
  }, [placesServiceRef, sessionTokenRef, mapRef, upsertMarker]);

  // ---- Render Kısmı (erken return’ler üstte, hook yok burada)
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
        <button
          onClick={() => attemptLoad(true)}
          style={{ marginTop: 8, padding: "10px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}
        >
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

      {/* Sağ üst butonlar */}
      <MapTopControls
        selfAvatarUrl={selfAvatarUrl}
        onOpenAvatar={() => setIsAvatarModalOpen(true)}
        onToggleSettings={() => dispatchPanels({ type: "TOGGLE", payload: PANEL_SETTINGS })}
        onToggleLayers={() => dispatchPanels({ type: "TOGGLE", payload: PANEL_LAYERS })}
        onToggleSearch={() => { dispatchPanels({ type: "TOGGLE", payload: PANEL_SEARCH }); setSearchText(""); setPredictions([]); setTimeout(measureInput, 0); }}
        searchBtnRef={searchBtnRef}
        layersBtnRef={layersBtnRef}
        settingsBtnRef={settingsBtnRef}
      />

      {/* Katman menüsü */}
      <div style={{ position: "absolute", top: "70px", right: "10px", zIndex: 20 }}>
        <MapTypeMenu
          open={overlay === PANEL_LAYERS}
          mapTypes={MAP_TYPES}
          onSelect={(type) => { try { mapRef.current?.setMapTypeId?.(type); } catch {} dispatchPanels({ type: "CLOSE_ALL" }); }}
          ref={layersMenuRef}
        />
      </div>

      {/* Arama paneli */}
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
      {/* gizli ölçüm span'i */}
      <span ref={sizerRef} style={{ position: "absolute", visibility: "hidden", whiteSpace: "pre", fontSize: 16, fontFamily: "inherit", fontWeight: 400 }} />

      {/* Seçili yer üst kartı + Check-in */}
      {selectedPlace && (
        <div
          style={{
            position: "absolute", top: 56, left: 12, right: 12, zIndex: 12,
            background: "white", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.28)", overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedPlace.name}</div>
            {selectedPlace.address && (<div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{selectedPlace.address}</div>)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #efefef", padding: "8px 10px" }}>
            <button
              onClick={() => setIsCheckInOpen(true)}
              style={{ padding: "8px 12px", background: "#0095f6", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
            >
              Check-in
            </button>
            <button onClick={() => { setSelectedPlace(null); removeMarker(SELECTED_MARKER_KEY); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }} title="Kapat">✖</button>
          </div>
        </div>
      )}

      {/* Google Map tuvali */}
      <div ref={mapDivRef} style={{ width: "100%", height: "100%", paddingBottom: 55 }} />

      {/* Sağ-alt FAB: Konumuma Git */}
      <button
        style={{
          position: "absolute",
          right: 14,
          bottom: `calc(${fabBottom + FAB_EXTRA_LIFT}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 20,
          width: 56, height: 56, borderRadius: "50%",
          background: "rgba(0,0,0,0.28)", border: "0", boxShadow: "none",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}
        onClick={() => {
          if (userLocation && mapRef.current) {
            try {
              const map = mapRef.current;
              const cur = map.getCenter()?.toJSON?.() || DEFAULT_CENTER;
              const z   = map.getZoom?.() ?? MOBILE_ZOOM;
              animateFlyTo(map, cur, userLocation, z, MOBILE_ZOOM, 1200);
              setUserMovedMap(false);
            } catch {}
          }
          try {
            const D = window.DeviceOrientationEvent;
            if (D && typeof D.requestPermission === "function") D.requestPermission().catch(() => {});
          } catch {}
        }}
        title="Konumuma git"
        aria-label="Konumuma git"
      >
        <LocateIcon size={28} color="#fff" weight="bold" />
      </button>

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
