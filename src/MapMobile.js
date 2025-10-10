// src/MapMobile.js
import React, { useEffect, useRef, useState, useCallback } from "react";
import { auth, db } from "./firebase";
import {
  collection, query, where, getDocs, doc, onSnapshot, updateDoc, setDoc,
} from "firebase/firestore";

import AvatarModal from "./AvatarModal";
import MapSettingsModal from "./MapSettingsModal";

/* ================================
   Sabitler / Ayarlar
==================================*/
const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID = "820d1b6d96bb2adc224b9924"; // senin Map ID

const GMAPS_SCRIPT_ID = "gmaps-js-sdk";
let _gmapsPromise = null;

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
   Google Maps Loader (klasik)
==================================*/
function buildGMapsUrl() {
  // ÖNEMLİ: loading=async KULLANMIYORUZ
  const params = new URLSearchParams({
    key: API_KEY,
    language: "tr",
    region: "TR",
    v: "weekly",
    libraries: "places", // AdvancedMarker yerine klasik Marker kullanacağız
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

function removeExistingGMapsScript() {
  const s = document.getElementById(GMAPS_SCRIPT_ID);
  if (s && s.parentNode) s.parentNode.removeChild(s);
  _gmapsPromise = null;
}

function loadGoogleMaps() {
  if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
  if (!API_KEY) return Promise.reject(new Error("NO_API_KEY"));
  if (_gmapsPromise) return _gmapsPromise;

  _gmapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = GMAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = buildGMapsUrl();

    script.onload = () => {
      if (window.google && window.google.maps) resolve(window.google.maps);
      else reject(new Error("LOAD_FAILED"));
    };
    script.onerror = () => reject(new Error("NETWORK_OR_BLOCKED"));

    document.head.appendChild(script);

    setTimeout(() => {
      if (!(window.google && window.google.maps)) reject(new Error("TIMEOUT"));
    }, 20000);
  });

  return _gmapsPromise;
}

/* ================================
   Bileşen
==================================*/
function MapMobile({ currentUserProfile, onUserClick }) {
  const [gmapsStatus, setGmapsStatus] = useState("idle"); // idle | no-key | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // uid -> marker
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
        setErrorMsg(".env dosyasında REACT_APP_GOOGLE_MAPS_API_KEY yok.");
        return;
      }

      setGmapsStatus("loading");
      setErrorMsg("");

      try {
        const gmaps = await loadGoogleMaps();

        if (!mapRef.current && mapDivRef.current) {
          mapRef.current = new gmaps.Map(mapDivRef.current, {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            mapTypeId: mapType,
            disableDefaultUI: true,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: "greedy",
            mapId: MAP_ID, // MAP ID ZORUNLU
          });
        }

        // Key yetki hatası hook'u
        window.gm_authFailure = () => {
          setErrorMsg("Google Maps anahtarı bu origin için yetkili değil (Key restrictions).");
          setGmapsStatus("error");
        };

        setGmapsStatus("ready");
      } catch (err) {
        setErrorMsg(err?.message || "Harita yüklenemedi.");
        setGmapsStatus("error");
      }
    },
    [mapType]
  );

  useEffect(() => {
    attemptLoad(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MapType değişince uygula
  useEffect(() => {
    if (mapRef.current && window.google && window.google.maps) {
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
        updateDoc(locationRef, { longitude: loc.lng, latitude: loc.lat, timestamp: new Date() })
          .catch(() => setDoc(locationRef, { longitude: loc.lng, latitude: loc.lat, timestamp: new Date() }));
      }
    };

    navigator.geolocation.getCurrentPosition(
      updateUserLocation,
      () => setUserLocation(null),
      geoOptions
    );
  }, [gmapsStatus, currentUserProfile?.isSharing]);

  // Arkadaş konumlarını dinle
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

        // users profillerini 10'luk gruplarla çek
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

        // locations'ı izinli UID'ler için dinle (10'luk IN limiti)
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
      } catch (_err) {
        setFriendsOnMap([]);
      }
    };

    run();

    return () => {
      unsubscribes.forEach((u) => { try { u(); } catch {} });
    };
  }, [gmapsStatus, currentUserProfile]);

  // ---- Marker yönetimi (klasik Marker ile) ----
  const upsertMarker = useCallback((key, position, opts = {}) => {
    if (!mapRef.current || !(window.google && window.google.maps)) return;
    const existing = markersRef.current.get(key);
    if (existing) {
      existing.setPosition(position);
      if (opts.title) existing.setTitle(opts.title);
      return existing;
    }
    const marker = new window.google.maps.Marker({
      position,
      map: mapRef.current,
      title: opts.title || "",
    });
    if (typeof opts.onClick === "function") {
      marker.addListener("click", opts.onClick);
    }
    markersRef.current.set(key, marker);
    return marker;
  }, []);

  const removeMarker = useCallback((key) => {
    const m = markersRef.current.get(key);
    if (m) {
      try { m.setMap(null); } catch {}
      markersRef.current.delete(key);
    }
  }, []);

  // Kendi marker'ını güncelle
  useEffect(() => {
    if (gmapsStatus !== "ready") return;
    if (userLocation) upsertMarker(selfMarkerKey, userLocation, { title: "Konumun" });
    else removeMarker(selfMarkerKey);
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

    // Artık görünmeyenleri temizle
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
          Geliştirme sunucusunu durdurup yeniden başlatman gerekebilir.
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
      {/* Sağ üst butonlar */}
      <div style={{ position: "absolute", top: "70px", right: "10px", zIndex: 10, display: "flex", flexDirection: "column", gap: "10px" }}>
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
            <div style={{ position: "absolute", top: "0", right: "50px", backgroundColor: "white", borderRadius: "8px", boxShadow: "0 2px 10px rgba(0,0,0,0.2)", overflow: "hidden", width: "150px", zIndex: 20 }}>
              {Object.keys(MAP_TYPES).map((label) => (
                <button
                  key={label}
                  onClick={() => { setMapType(MAP_TYPES[label]); setIsStyleMenuOpen(false); }}
                  style={{ display: "block", width: "100%", padding: "12px 16px", background: "none", border: "none", textAlign: "left", cursor: "pointer", borderBottom: "1px solid #efefef" }}
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
