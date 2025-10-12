import React, { useEffect, useRef, useState, useCallback } from "react";
import { auth, db } from "./firebase";
import {
  collection, query, where, getDocs, doc, onSnapshot, updateDoc, setDoc,
} from "firebase/firestore";

import AvatarModal from "./AvatarModal";
import MapSettingsModal from "./MapSettingsModal";

/* ================================
   Google Maps Loader — Tek Nokta (callback tabanlı, stabil)
==================================*/
const GMAPS_SCRIPT_ID = "gmaps-js-sdk";
let _gmapsPromise = null;

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID  = process.env.REACT_APP_GMAPS_MAP_ID || ""; // <-- .env’den okunur

function buildGMapsUrl() {
  // Map ID yoksa marker lib'i yüklemiyoruz (overlay/hata engellenir)
  const libs = MAP_ID ? "places,marker" : "places";
  const params = new URLSearchParams({
    key: API_KEY,
    language: "tr",
    region: "TR",
    v: "weekly",
    libraries: libs,
    callback: "mylasaInitMap",
    // Google'ın yeni önerisi: loading=async (uyarıyı susturur)
    loading: "async"
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
        // Advanced marker sadece vector (mapId) ile mantıklı.
        // importLibrary bazı ortamlarda sorun çıkarabiliyor; varsa dene, yoksa global'den alırız.
        try { 
          if (MAP_ID) {
            await window.google?.maps?.importLibrary?.("marker");
          }
        } catch {/* no-op */}

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
  const [friendsOnMap, setFriendsOnMap] = useState([]);

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
          if (MAP_ID) opts.mapId = MAP_ID; // <-- vector + advanced marker için
          mapRef.current = new gmaps.Map(mapDivRef.current, opts);
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
    const updateUserLocation = (position) => {
      const user = auth.currentUser;
      const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
      setUserLocation(loc);

      if (mapRef.current) {
        mapRef.current.setCenter(loc);
        mapRef.current.setZoom(MOBILE_ZOOM);
      }

      if (user && currentUserProfile?.isSharing !== false) {
        const locationRef = doc(db, "locations", user.uid);
        updateDoc(locationRef, {
          longitude: loc.lng,
          latitude: loc.lat,
          timestamp: new Date(),
        }).catch(() => {
          setDoc(locationRef, {
            longitude: loc.lng,
            latitude: loc.lat,
            timestamp: new Date(),
          });
        });
      }
    };

    navigator.geolocation.getCurrentPosition(
      updateUserLocation,
      () => setUserLocation(null),
      geoOptions
    );
  }, [gmapsStatus, currentUserProfile?.isSharing]);

  // Arkadaş konumlarını dinle (izinli kullanıcılar)
  useEffect(() => {
    if (gmapsStatus !== "ready") return;

    let unsubscribes = [];

    const run = async () => {
      try {
        const myId = auth.currentUser?.uid;
        const followings = Array.isArray(currentUserProfile?.takipEdilenler)
          ? currentUserProfile.takipEdilenler
          : [];

        if (!myId || followings.length === 0) {
          setFriendsOnMap([]);
          return;
        }

        const batches = [];
        for (let i = 0; i < followings.length; i += 10) {
          batches.push(followings.slice(i, i + 10));
        }

        const profileMap = new Map();
        for (const batch of batches) {
          const snap = await getDocs(query(collection(db, "users"), where("uid", "in", batch)));
          snap.forEach((d) => profileMap.set(d.id, { id: d.id, ...d.data() }));
        }

        const allowedUIDs = followings.filter((uid) => {
          const p = profileMap.get(uid);
          if (!p || p.isSharing === false) return false;
          if (p.sharingMode === "all_friends") {
            return Array.isArray(p.takipEdilenler) && p.takipEdilenler.includes(myId);
          }
          if (p.sharingMode === "selected_friends") {
            return Array.isArray(p.sharingWhitelist) && p.sharingWhitelist.includes(myId);
          }
          return false;
        });

        if (allowedUIDs.length === 0) {
          setFriendsOnMap([]);
          return;
        }

        const locBatches = [];
        for (let i = 0; i < allowedUIDs.length; i += 10) {
          locBatches.push(allowedUIDs.slice(i, i + 10));
        }

        unsubscribes = locBatches.map((batch) => {
          const qLoc = query(collection(db, "locations"), where("__name__", "in", batch));
          return onSnapshot(qLoc, (snap) => {
            const locs = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
            const merged = locs
              .map((loc) => {
                const prof = profileMap.get(loc.uid);
                if (!prof) return null;
                return { ...loc, ...prof };
              })
              .filter(Boolean);

            setFriendsOnMap((prev) => {
              const map = new Map(prev.map((x) => [x.uid, x]));
              merged.forEach((x) => map.set(x.uid, x));
              return Array.from(map.values());
            });
          });
        });
      } catch {
        setFriendsOnMap([]);
      }
    };

    run();

    return () => { unsubscribes.forEach((u) => { try { u(); } catch {} }); };
  }, [gmapsStatus, currentUserProfile]);

  // ---- Marker yönetimi (AdvancedMarkerElement sadece MAP_ID varsa) ----
  const upsertMarker = useCallback((key, position, opts = {}) => {
    if (!mapRef.current || !(window.google && window.google.maps)) return;

    const Advanced = MAP_ID ? window.google?.maps?.marker?.AdvancedMarkerElement : null;
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
  }, []);

  const removeMarker = useCallback((key) => {
    const m = markersRef.current.get(key);
    if (m) {
      try { if (m.setMap) m.setMap(null); else if (m.map) m.map = null; } catch {}
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
      </div>

      {/* Google Map tuvali */}
      <div ref={mapDivRef} style={{ width: "100%", height: "100%", paddingBottom: 55 }} />

      {isAvatarModalOpen && <AvatarModal onClose={() => setIsAvatarModalOpen(false)} />}
      {isSettingsModalOpen && <MapSettingsModal onClose={() => setIsSettingsModalOpen(false)} />}
    </div>
  );
}

export default MapMobile;
