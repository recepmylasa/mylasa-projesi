// src/MapMobile.js — TAM DOSYA

import React, { useEffect, useRef, useState, useCallback } from "react";
import { auth, db } from "./firebase";
import {
  collection, query, where, getDocs, doc, onSnapshot, updateDoc, setDoc,
} from "firebase/firestore";

import AvatarModal from "./AvatarModal";
import MapSettingsModal from "./MapSettingsModal";
import NewCheckInDetailMobile from "./NewCheckInDetailMobile";

/* ================================
   DEV-only: Google’un gürültülü uyarılarını sessize al
   PROD’da çalışmaz; davranışı değiştirmez.
==================================*/
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const _warn = console.warn;
  console.warn = (...args) => {
    const first = (args && args[0] ? String(args[0]) : "");
    if (
      /google\.maps\.Marker is deprecated/i.test(first) ||
      /places\.AutocompleteService is not available to new customers/i.test(first) ||
      /places\.PlacesService is not available to new customers/i.test(first)
    ) {
      return;
    }
    _warn(...args);
  };
}

/* ================================
   Google Maps Loader — Tek Nokta (callback tabanlı, stabil)
==================================*/
const GMAPS_SCRIPT_ID = "gmaps-js-sdk";
let _gmapsPromise = null;

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID  = (process.env.REACT_APP_GMAPS_MAP_ID || "").trim();

function buildGMapsUrl() {
  const libs = "places,marker";
  const params = new URLSearchParams({
    key: API_KEY,
    language: "tr",
    region: "TR",
    v: "weekly",
    libraries: libs,
    callback: "mylasaInitMap",
    loading: "async",
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

function removeExistingGMapsScript() {
  const s = document.getElementById(GMAPS_SCRIPT_ID);
  if (s && s.parentNode) s.parentNode.removeChild(s);
  _gmapsPromise = null;
}

function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!API_KEY) return Promise.reject(new Error("NO_API_KEY"));
  if (_gmapsPromise) return _gmapsPromise;

  _gmapsPromise = new Promise((resolve, reject) => {
    removeExistingGMapsScript();

    let resolved = false;
    window.mylasaInitMap = async () => {
      try {
        try { await window.google?.maps?.importLibrary?.("marker"); } catch {}
        if (!window.google?.maps?.Map) throw new Error("LIB_NOT_READY");
        resolved = true;
        resolve(window.google.maps);
      } catch (e) {
        reject(e);
      } finally {
        try { delete window.mylasaInitMap; } catch {}
      }
    };

    const script = document.createElement("script");
    script.id = GMAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = buildGMapsUrl();
    script.onerror = () => reject(new Error("NETWORK_OR_BLOCKED"));
    document.head.appendChild(script);

    setTimeout(() => { if (!resolved) reject(new Error("TIMEOUT")); }, 20000);
    window.gm_authFailure = () => reject(new Error("AUTH_FAILED"));
  });

  return _gmapsPromise;
}

/* ================================
   Sabitler
==================================*/
const DEFAULT_CENTER = { lat: 39.0, lng: 35.0 };
const DEFAULT_ZOOM = 5;
const MOBILE_ZOOM = 14;

const containerStyle = { position: "relative", width: "100%", height: "100vh" };

const buttonStyle = {
  backgroundColor: "white",
  border: "1px solid #dbdbdb",
  borderRadius: "50%",
  width: "40px",
  height: "40px",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  cursor: "pointer",
  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
};

const FALLBACK_STYLE = {
  width: "100%",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
  padding: 16,
};

const MAP_TYPES = {
  "Yol Haritası": "roadmap",
  "Uydu": "satellite",
  "Arazi": "terrain",
  "Hibrit": "hybrid",
};

const SELECTED_MARKER_KEY = "__selected_place__";

/* ================================
   Bileşen
==================================*/
function MapMobile({ currentUserProfile, onUserClick }) {
  // "idle" | "no-key" | "loading" | "ready" | "error"
  const [gmapsStatus, setGmapsStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const selfMarkerKey = "__self__";

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [mapType, setMapType] = useState(MAP_TYPES["Yol Haritası"]);

  const [userLocation, setUserLocation] = useState(null);
  const [friendsOnMap,  setFriendsOnMap]  = useState([]);

  // Autocomplete
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);

  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const debounceRef = useRef(null);

  // UX: haritayı oynatan kullanıcıyı rahatsız etme
  const [firstFixDone, setFirstFixDone] = useState(false);
  const [userMovedMap, setUserMovedMap] = useState(false);

  const attemptLoad = useCallback(
    async (force = false) => {
      if (force) removeExistingGMapsScript();

      if (!API_KEY) {
        setGmapsStatus("no-key");
        setErrorMsg(".env içinde REACT_APP_GOOGLE_MAPS_API_KEY yok.");
        return;
      }

      setGmapsStatus("loading");
      setErrorMsg("");

      try {
        const gmaps = await loadGoogleMaps();

        if (!mapRef.current && mapDivRef.current) {
          const opts = {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            mapTypeId: mapType,
            disableDefaultUI: true,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: "greedy",
          };
          if (MAP_ID) opts.mapId = MAP_ID;
          mapRef.current = new gmaps.Map(mapDivRef.current, opts);

          // Kullanıcı haritayı eline aldı mı?
          mapRef.current.addListener("dragstart", () => setUserMovedMap(true));
        }

        // Places servisleri
        if (window.google?.maps && mapRef.current) {
          const { places } = window.google.maps;
          if (!autocompleteServiceRef.current) {
            autocompleteServiceRef.current = new places.AutocompleteService();
          }
          if (!placesServiceRef.current) {
            placesServiceRef.current = new places.PlacesService(mapRef.current);
          }
          sessionTokenRef.current = new places.AutocompleteSessionToken();
        }

        setGmapsStatus("ready");
      } catch (err) {
        let msg = err?.message || "Harita yüklenemedi.";
        if (msg === "NO_API_KEY") { setGmapsStatus("no-key"); msg = "API anahtarı yok (.env)."; }
        else if (msg === "AUTH_FAILED") { setGmapsStatus("error"); msg = "Key restrictions hatası (origin yetkisi)."; }
        else if (msg === "NETWORK_OR_BLOCKED") { setGmapsStatus("error"); msg = "Ağ/engelleyici nedeniyle indirilemedi."; }
        else if (msg === "TIMEOUT") { setGmapsStatus("error"); msg = "Google Maps zaman aşımı."; }
        else if (msg === "LIB_NOT_READY") { setGmapsStatus("error"); msg = "Google Maps kütüphanesi hazır değil."; }
        else { setGmapsStatus("error"); }
        setErrorMsg(msg);
      }
    },
    [mapType]
  );

  useEffect(() => { attemptLoad(false); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (mapRef.current && window.google?.maps) {
      mapRef.current.setMapTypeId(mapType);
    }
  }, [mapType]);

  // Konumu al & Firestore'a yaz
  useEffect(() => {
    if (gmapsStatus !== "ready") return;

    const geoOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    const onPos = (position) => {
      const user = auth.currentUser;
      const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
      setUserLocation(loc);

      if (mapRef.current) {
        // İlk sabitlemede ya da kullanıcı haritayı hareket ettirmediyse ortala
        if (!firstFixDone || !userMovedMap) {
          try {
            mapRef.current.setCenter(loc);
            mapRef.current.setZoom(MOBILE_ZOOM);
          } catch {}
        }
      }
      if (!firstFixDone) setFirstFixDone(true);

      if (user && currentUserProfile?.isSharing !== false) {
        const locationRef = doc(db, "locations", user.uid);
        updateDoc(locationRef, {
          longitude: loc.lng,
          latitude:  loc.lat,
          timestamp: new Date(),
        }).catch(() => {
          setDoc(locationRef, {
            longitude: loc.lng,
            latitude:  loc.lat,
            timestamp: new Date(),
          });
        });
      }
    };

    const onErr = () => setUserLocation(null);

    navigator.geolocation.getCurrentPosition(onPos, onErr, geoOptions);
    const watchId = navigator.geolocation.watchPosition(onPos, onErr, geoOptions);

    return () => { try { navigator.geolocation.clearWatch(watchId); } catch {} };
  }, [gmapsStatus, currentUserProfile?.isSharing, firstFixDone, userMovedMap]);

  // ---- Marker yönetimi ----
  const upsertMarker = useCallback((key, position, opts = {}) => {
    if (!mapRef.current || !(window.google && window.google.maps)) return;

    const Advanced =
      (MAP_ID && window.google?.maps?.marker?.AdvancedMarkerElement)
        ? window.google.maps.marker.AdvancedMarkerElement
        : null;

    const existing = markersRef.current.get(key);

    if (existing) {
      if (Advanced && existing.position) {
        existing.position = position;
      } else if (existing.setPosition) {
        existing.setPosition(position);
      }
      if (opts.title && existing.setTitle) existing.setTitle(opts.title);
      return existing;
    }

    let marker;
    if (Advanced) {
      marker = new Advanced({
        map: mapRef.current,
        position,
        title: opts.title || "",
      });
      if (typeof opts.onClick === "function") {
        marker.addListener?.("gmp-click", opts.onClick);
      }
    } else {
      marker = new window.google.maps.Marker({
        position,
        map: mapRef.current,
        title: opts.title || "",
      });
      if (typeof opts.onClick === "function") {
        marker.addListener("click", opts.onClick);
      }
    }

    markersRef.current.set(key, marker);
    return marker;
  }, [MAP_ID]);

  const removeMarker = useCallback((key) => {
    const m = markersRef.current.get(key);
    if (m) {
      try { if (m.setMap) m.setMap(null); else if ("map" in m) m.map = null; } catch {}
      markersRef.current.delete(key);
    }
  }, []);

  // Kendi marker'ını güncelle
  useEffect(() => {
    if (gmapsStatus !== "ready") return;
    if (userLocation) {
      upsertMarker(selfMarkerKey, userLocation, { title: "Konumun" });
    } else {
      removeMarker(selfMarkerKey);
    }
  }, [gmapsStatus, userLocation, upsertMarker, removeMarker]);

  // Arkadaş marker'larını güncelle
  useEffect(() => {
    if (gmapsStatus !== "ready") return;

    const liveKeys = new Set();
    friendsOnMap.forEach((f) => {
      if (typeof f.longitude === "number" && typeof f.latitude === "number") {
        const key = f.uid;
        liveKeys.add(key);
        upsertMarker(key, { lat: f.latitude, lng: f.longitude }, {
          title: f.kullaniciAdi || f.displayName || "Arkadaş",
          onClick: () => { if (typeof onUserClick === "function") onUserClick({ uid: f.uid }); },
        });
      }
    });

    Array.from(markersRef.current.keys()).forEach((key) => {
      if (key === selfMarkerKey) return;
      if (!liveKeys.has(key)) removeMarker(key);
    });
  }, [gmapsStatus, friendsOnMap, upsertMarker, removeMarker, onUserClick]);

  // ========= Autocomplete =========
  useEffect(() => {
    if (!isSearchOpen || gmapsStatus !== "ready") return;
    if (!searchText.trim()) { setPredictions([]); return; }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const svc = autocompleteServiceRef.current;
      const token = sessionTokenRef.current;
      if (!svc || !token) return;

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

    return () => clearTimeout(debounceRef.current);
  }, [searchText, isSearchOpen, gmapsStatus]);

  const handleSelectPrediction = (pred) => {
    const svc = placesServiceRef.current;
    const token = sessionTokenRef.current;
    if (!svc) return;

    svc.getDetails(
      {
        placeId: pred.place_id,
        fields: ["place_id", "name", "geometry", "formatted_address"],
        sessionToken: token,
      },
      (place, status) => {
        const ok = window.google.maps.places.PlacesServiceStatus.OK;
        if (status !== ok || !place || !place.geometry?.location) {
          return;
        }
        const pos = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };

        setSelectedPlace({
          id: place.place_id,
          name: place.name,
          lat: pos.lat,
          lng: pos.lng,
          address: place.formatted_address || "",
        });

        try {
          mapRef.current?.panTo(pos);
          mapRef.current?.setZoom(17);
        } catch {}

        upsertMarker(SELECTED_MARKER_KEY, pos, { title: place.name });

        setPredictions([]);
        setIsSearchOpen(false);
        setSearchText(place.name);

        try {
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        } catch {}
      }
    );
  };

  useEffect(() => {
    if (!isSearchOpen) setPredictions([]);
  }, [isSearchOpen]);

  /* ============ Render ============ */
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
        <div style={{ maxWidth: 520, opacity: 0.85 }}>
          {errorMsg || "Beklenmeyen bir hata oluştu."}
        </div>
        <button
          onClick={() => attemptLoad(true)}
          style={{
            marginTop: 8,
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Sağ üst butonlar */}
      <div
        style={{
          position: "absolute",
          top: "70px",
          right: "10px",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {/* Konumuma git */}
        <button
          style={buttonStyle}
          onClick={() => {
            if (userLocation && mapRef.current) {
              try {
                mapRef.current.panTo(userLocation);
                mapRef.current.setZoom(MOBILE_ZOOM);
                setUserMovedMap(false);
              } catch {}
            }
          }}
          title="Konumuma git"
        >
          <span role="img" aria-label="loc">📍</span>
        </button>

        <button style={buttonStyle} onClick={() => setIsAvatarModalOpen(true)} title="Avatarını Değiştir">
          <span role="img" aria-label="profile">👤</span>
        </button>
        <button style={buttonStyle} onClick={() => setIsSettingsModalOpen(true)} title="Konum Ayarları">
          <span role="img" aria-label="settings">⚙️</span>
        </button>

        <div style={{ position: "relative" }}>
          <button style={buttonStyle} onClick={() => setIsStyleMenuOpen((v) => !v)} title="Harita Katmanları">
            <span role="img" aria-label="layers">🗺️</span>
          </button>
          {isStyleMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "0",
                right: "50px",
                backgroundColor: "white",
                borderRadius: "8px",
                boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                overflow: "hidden",
                width: "150px",
                zIndex: 20,
              }}
            >
              {Object.keys(MAP_TYPES).map((label) => (
                <button
                  key={label}
                  onClick={() => {
                    setMapType(MAP_TYPES[label]);
                    setIsStyleMenuOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "12px 16px",
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    borderBottom: "1px solid #efefef",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Arama butonu */}
        <button
          style={buttonStyle}
          onClick={() => setIsSearchOpen(true)}
          title="Yer Ara"
        >
          <span role="img" aria-label="search">🔍</span>
        </button>
      </div>

      {/* Arama paneli */}
      {isSearchOpen && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 20,
            background: "white",
            borderRadius: 12,
            boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", gap: 8 }}>
            <span>🔎</span>
            <input
              autoFocus
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Yer ara…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 16,
              }}
            />
            <button
              onClick={() => { setIsSearchOpen(false); setPredictions([]); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
              title="Kapat"
            >
              ✖
            </button>
          </div>

          {predictions.length > 0 && (
            <div style={{ borderTop: "1px solid #efefef", maxHeight: 260, overflowY: "auto" }}>
              {predictions.map((p) => (
                <button
                  key={p.place_id}
                  onClick={() => handleSelectPrediction(p)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    background: "white",
                    border: "none",
                    borderBottom: "1px solid #f3f3f3",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{p.structured_formatting?.main_text || p.description}</div>
                  {p.structured_formatting?.secondary_text && (
                    <div style={{ fontSize: 12, color: "#777" }}>
                      {p.structured_formatting.secondary_text}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Seçili yer üst kartı + Check-in */}
      {selectedPlace && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 12,
            right: 12,
            zIndex: 12,
            background: "white",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedPlace.name}</div>
            {selectedPlace.address && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{selectedPlace.address}</div>
            )}
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            borderTop: "1px solid #efefef", padding: "8px 10px"
          }}>
            <button
              onClick={() => setIsCheckInOpen(true)}
              style={{
                padding: "8px 12px",
                background: "#0095f6",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Check-in
            </button>
            <button
              onClick={() => { setSelectedPlace(null); removeMarker(SELECTED_MARKER_KEY); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
              title="Kapat"
            >
              ✖
            </button>
          </div>
        </div>
      )}

      {/* Google Map tuvali */}
      <div ref={mapDivRef} style={{ width: "100%", height: "100%", paddingBottom: 55 }} />

      {/* Modallar */}
      {isAvatarModalOpen && <AvatarModal onClose={() => setIsAvatarModalOpen(false)} />}
      {isSettingsModalOpen && <MapSettingsModal onClose={() => setIsSettingsModalOpen(false)} />}

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

export default MapMobile;
