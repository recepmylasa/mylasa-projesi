// src/MapMobile.js — TAM DOSYA (Mobil)
// - Sağ üstteki butonlar: şeffaf siyah daire
// - Arama: ikon TOGGLE (açıksa kapatır), her açılışta input temiz; kutu dar başlar, yazdıkça genişler
// - Kendi marker’ı: alt etiket (profil ismi + pil ikonu + yüzde), pusula konisi (cihaz yönüne göre döner)
// - Avatar marker’ları: orijinal oran korunur, diğer davranışlar aynı
// - AdvancedMarkerElement: SADECE geçerli MAP_ID varsa kullan (aksi halde klasik Marker) —
//   böylece "Harita, geçerli bir harita kimliği olmadan başlatıldı" uyarısı ortadan kalkar.

import React, { useEffect, useRef, useState, useCallback } from "react";
import { auth, db } from "./firebase";
import {
  collection, query, where, getDocs, doc, onSnapshot, updateDoc, setDoc,
} from "firebase/firestore";

import AvatarModal from "./AvatarModal";
import MapSettingsModal from "./MapSettingsModal";
import NewCheckInDetailMobile from "./NewCheckInDetailMobile";
import { SearchIcon, LayersIcon, SettingsIcon, LocateIcon } from "./icons"; // dikkat: k\u00fc\u00e7\u00fck i

/* ================================
   DEV-only: Google’un gürültülü uyarılarını sessize al
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
   Google Maps Loader — Tek Nokta
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

// yeni: şeffaf siyah daire (sağ üst butonlar)
const darkCircleBtn = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: "rgba(0,0,0,0.28)",
  border: 0,
  boxShadow: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
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
const SELF_MARKER_KEY = "__self__";

const MIN_FAB_BOTTOM = 150;
const FAB_EXTRA_LIFT = 36;

/* ================================
   Yardımcılar — avatar içerik / uçuş
==================================*/
function makeAvatarOnlyContent(url, heightPx = 64) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.transform = "translate(-50%, -100%)"; // alt merkez
  wrap.style.willChange = "transform";

  const img = document.createElement("img");
  img.src = url;
  img.alt = "avatar";
  img.style.height = `${heightPx}px`;
  img.style.width = "auto";
  img.style.display = "block";
  img.style.objectFit = "contain";
  img.style.filter = "drop-shadow(0 6px 12px rgba(0,0,0,.35))";
  wrap.appendChild(img);

  return wrap;
}

/** Kendi marker’ı için: pusula konisi + avatar + alt etiket (isim + pil + yüzde) */
function makeSelfContent({ url, heightPx = 68, name = "Ben", battery = null, headingDeg = null }) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.transform = "translate(-50%, -100%)";
  wrap.style.willChange = "transform";
  wrap.style.pointerEvents = "none"; // haritayı engellemesin

  // --- Pusula konisi (avatarın altından çıkar) — sarı ton
  const cone = document.createElement("div");
  cone.style.position = "absolute";
  cone.style.left = "50%";
  cone.style.top = "100%";
  cone.style.width = "0";
  cone.style.height = "0";
  cone.style.borderLeft = "14px solid transparent";
  cone.style.borderRight = "14px solid transparent";
  cone.style.borderTop = "34px solid rgba(250, 204, 21, 0.35)"; // #facc15 ~ sarı
  cone.style.transformOrigin = "50% 0%";
  cone.style.transform = `translate(-50%, -6px) rotate(${headingDeg ?? 0}deg)`;
  cone.style.filter = "blur(0.2px)";
  cone.style.display = headingDeg == null ? "none" : "block";
  wrap.appendChild(cone);

  // --- Avatar
  const img = document.createElement("img");
  img.src = url;
  img.alt = "avatar";
  img.style.height = `${heightPx}px`;
  img.style.width = "auto";
  img.style.display = "block";
  img.style.objectFit = "contain";
  img.style.filter = "drop-shadow(0 6px 12px rgba(0,0,0,.35))";
  wrap.appendChild(img);

  // --- Alt etiket (isim + pil + yüzde)
  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.left = "50%";
  label.style.top = "100%";
  label.style.transform = "translate(-50%, 8px)";
  label.style.background = "rgba(255,255,255,0.92)";
  label.style.color = "#111";
  label.style.fontSize = "12px";
  label.style.fontWeight = "700";
  label.style.padding = "3px 8px";
  label.style.borderRadius = "10px";
  label.style.boxShadow = "0 4px 10px rgba(0,0,0,.18)";
  label.style.display = "flex";
  label.style.alignItems = "center";
  label.style.gap = "6px";
  label.style.pointerEvents = "none";

  const nameSpan = document.createElement("span");
  nameSpan.textContent = name || "Ben";
  label.appendChild(nameSpan);

  // Pil ikonu (CSS ile)
  const batWrap = document.createElement("div");
  batWrap.style.position = "relative";
  batWrap.style.width = "18px";
  batWrap.style.height = "10px";
  batWrap.style.border = "2px solid #111";
  batWrap.style.borderRadius = "2px";
  batWrap.style.boxSizing = "border-box";

  const cap = document.createElement("div");
  cap.style.position = "absolute";
  cap.style.right = "-3px";
  cap.style.top = "2px";
  cap.style.width = "2px";
  cap.style.height = "6px";
  cap.style.background = "#111";
  cap.style.borderRadius = "1px";
  batWrap.appendChild(cap);

  const fill = document.createElement("div");
  fill.style.position = "absolute";
  fill.style.left = "0";
  fill.style.top = "0";
  fill.style.bottom = "0";
  fill.style.width = battery == null ? "100%" : `${Math.max(3, Math.round((battery || 0) * 100))}%`;
  const color = battery == null ? "#888" : (battery > 0.5 ? "#16a34a" : battery > 0.2 ? "#d97706" : "#ef4444");
  fill.style.background = color;
  fill.style.borderRadius = "1px";
  if (battery == null) { fill.style.opacity = "0.55"; }
  batWrap.appendChild(fill);

  label.appendChild(batWrap);

  const pct = document.createElement("span");
  pct.style.fontWeight = "700";
  pct.style.fontSize = "11px";
  pct.style.minWidth = "26px";
  pct.style.textAlign = "right";
  pct.textContent = battery == null ? "—" : `${Math.round((battery || 0) * 100)}%`;
  label.appendChild(pct);

  wrap.appendChild(label);

  return { node: wrap, refs: { cone, nameSpan, fill, pct } };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; }
function animateFlyTo(map, fromCenter, toCenter, fromZoom, toZoom, totalMs = 1150) {
  if (!map) return;
  const start = performance.now();
  const midZoom = Math.max(3, Math.min(8, (fromZoom ?? 12) - 3));

  function frame(now) {
    const t = Math.min(1, (now - start) / totalMs);
    const e = easeInOut(t);

    let zoom;
    if (t < 0.3) zoom = lerp(fromZoom ?? 12, midZoom, t / 0.3);
    else if (t < 0.7) zoom = midZoom;
    else zoom = lerp(midZoom, toZoom ?? MOBILE_ZOOM, (t - 0.7) / 0.3);

    const lat = lerp(fromCenter.lat, toCenter.lat, e);
    const lng = lerp(fromCenter.lng, toCenter.lng, e);

    try { map.setCenter({ lat, lng }); map.setZoom(zoom); } catch {}
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

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

  // Advanced marker kullanılabilir mi? (MAP_ID zorunlu)
  const advancedAllowedRef = useRef(false);

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [mapType, setMapType] = useState(MAP_TYPES["Yol Haritası"]);

  const [userLocation, setUserLocation] = useState(null);
  const [friendsOnMap,  setFriendsOnMap]  = useState([]);

  const [selfAvatarUrl, setSelfAvatarUrl] = useState("/avatars/avatar 1.png"); // fallback
  const [selfDisplayName, setSelfDisplayName] = useState("");

  // pil & pusula
  const [batteryLevel, setBatteryLevel] = useState(null); // 0..1 veya null
  const [headingDeg, setHeadingDeg] = useState(null);     // derece veya null
  const selfUIRef = useRef({ cone: null, nameSpan: null, fill: null, pct: null });

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

  // Arama kutusunu metne göre genişletmek için ölçüm
  const sizerRef = useRef(null);
  const [inputWidth, setInputWidth] = useState(220); // dar başlangıç

  const measureInput = useCallback(() => {
    try {
      const baseMin = 220;
      const maxW = Math.min(Math.max(window.innerWidth - 48, 280), 560);
      const sizer = sizerRef.current;
      if (!sizer) { setInputWidth(baseMin); return; }
      sizer.textContent = (searchText && searchText.length > 0 ? searchText : "Yer ara…");
      const w = Math.ceil(sizer.offsetWidth) + 80; // ikonlar + padding
      setInputWidth(Math.max(baseMin, Math.min(maxW, w)));
    } catch {
      setInputWidth(220);
    }
  }, [searchText]);

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

  // UX
  const [firstFixDone, setFirstFixDone] = useState(false);
  const [userMovedMap, setUserMovedMap] = useState(false);

  // FAB: her zaman alt navigasyonun üstünde
  const [fabBottom, setFabBottom] = useState(MIN_FAB_BOTTOM);
  const measureBottomUI = useCallback(() => {
    let h = 0;

    const knownSelectors = [
      ".bottom-nav", "nav.bottom-nav", "#bottom-nav", "[data-bottom-nav]",
      ".BottomNav", 'div[class*="BottomNav"]', 'div[class*="bottom-nav"]',
      'div[class*="bottomNav"]'
    ];
    knownSelectors.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      h = Math.max(h, r.height);
    });

    // Genel tarama: bottom: fixed
    const all = Array.from(document.body.getElementsByTagName("*"));
    for (const el of all) {
      const cs = window.getComputedStyle(el);
      if (cs.position !== "fixed") continue;
      const r = el.getBoundingClientRect();
      const overlapsBottom = r.bottom >= window.innerHeight - 1;
      if (overlapsBottom) {
        const covered = Math.min(r.height, 280);
        h = Math.max(h, covered);
      }
    }

    if (h === 0) h = 84;           // güvenli varsayılan
    const padding = 36;            // nav ile tampon
    const candidate = h + padding; // gerçek nav + tampon
    setFabBottom(Math.max(candidate, MIN_FAB_BOTTOM));
  }, []);
  useEffect(() => {
    measureBottomUI();
    const onResize = () => measureBottomUI();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    setTimeout(measureBottomUI, 0);
    setTimeout(measureBottomUI, 300);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [measureBottomUI]);

  // Avatar’ı ve profil adını canlı dinle
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

  // Pil seviyesi (destek varsa)
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

  // Pusula: cihaz yönü (iOS’ta izin gerektirebilir)
  useEffect(() => {
    let handler = null;
    const start = () => {
      handler = (e) => {
        let h = null;
        if (typeof e.webkitCompassHeading === "number") {
          h = e.webkitCompassHeading;                // iOS (0=north clockwise)
        } else if (typeof e.alpha === "number") {
          h = (360 - e.alpha);                       // Android (yaklaşık)
        }
        if (h != null && !Number.isNaN(h)) setHeadingDeg(((h % 360) + 360) % 360);
      };
      window.addEventListener("deviceorientation", handler, true);
    };

    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === "function") {
      // izin kullanıcı etkileşimiyle istenir; ilk dokunuşta sor
      const ask = () => {
        D.requestPermission().then((state) => { if (state === "granted") start(); })
          .catch(() => {});
        window.removeEventListener("click", ask);
        window.removeEventListener("touchend", ask);
      };
      window.addEventListener("click", ask, { once: true });
      window.addEventListener("touchend", ask, { once: true });
    } else if ("DeviceOrientationEvent" in window) {
      start(); // Android
    }

    return () => { if (handler) window.removeEventListener("deviceorientation", handler, true); };
  }, []);

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
          if (MAP_ID) opts.mapId = MAP_ID; // AdvancedMarker kullanımı için şart
          mapRef.current = new gmaps.Map(mapDivRef.current, opts);
          mapRef.current.addListener("dragstart", () => setUserMovedMap(true));

          // Advanced marker kullanılabilirliğini belirle
          advancedAllowedRef.current = !!(gmaps?.marker?.AdvancedMarkerElement) && !!MAP_ID;
        }

        // Places
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
        else if (msg === "AUTH_FAILED") { setGmapsStatus("error"); msg = "Key restrictions hatası (origin yetkisi/billing)."; }
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

  // Konum
  useEffect(() => {
    if (gmapsStatus !== "ready") return;

    const geoOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    const onPos = (position) => {
      const user = auth.currentUser;
      const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
      setUserLocation(loc);

      if (mapRef.current) {
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

  // --- Avatar oranını korumak için meta önbelleği
  const avatarMetaRef = useRef(new Map()); // url -> {w,h}

  // Marker yönetimi
  const upsertMarker = useCallback((key, position, opts = {}) => {
    if (!mapRef.current || !(window.google && window.google.maps)) return;

    // AdvancedMarker, SADECE izinliyse
    const Advanced = (advancedAllowedRef.current && window.google?.maps?.marker?.AdvancedMarkerElement)
      ? window.google.maps.marker.AdvancedMarkerElement
      : null;

    const existing = markersRef.current.get(key);

    // avatar içerik/icon
    const heightPx = opts.heightPx || 64;
    let content = null;
    let icon = null;

    if (opts.avatarUrl) {
      if (Advanced) {
        if (opts.isSelf) {
          const built = makeSelfContent({
            url: opts.avatarUrl,
            heightPx,
            name: opts.selfName,
            battery: opts.batteryLevel,
            headingDeg: opts.headingDeg,
          });
          content = built.node;
          selfUIRef.current = built.refs; // referansları sakla (canlı güncelleme)
        } else {
          content = makeAvatarOnlyContent(opts.avatarUrl, heightPx);
        }
      } else {
        // klasik Marker icon (orantı koru)
        const meta = avatarMetaRef.current.get(opts.avatarUrl);
        if (meta?.w && meta?.h) {
          const ratio = meta.w / meta.h;
          icon = {
            url: opts.avatarUrl,
            scaledSize: new window.google.maps.Size(heightPx * ratio, heightPx),
            anchor: new window.google.maps.Point((heightPx * ratio) / 2, heightPx),
          };
        } else {
          const img = new Image();
          img.onload = () => {
            avatarMetaRef.current.set(opts.avatarUrl, { w: img.naturalWidth, h: img.naturalHeight });
            const m = markersRef.current.get(key);
            if (m && m.setIcon) {
              const ratio = img.naturalWidth / img.naturalHeight;
              m.setIcon({
                url: opts.avatarUrl,
                scaledSize: new window.google.maps.Size(heightPx * ratio, heightPx),
                anchor: new window.google.maps.Point((heightPx * ratio) / 2, heightPx),
              });
            }
          };
          img.src = opts.avatarUrl;

          icon = {
            url: opts.avatarUrl,
            scaledSize: new window.google.maps.Size(heightPx, heightPx),
            anchor: new window.google.maps.Point(heightPx / 2, heightPx),
          };
        }
      }
    }

    if (existing) {
      if (Advanced && existing.position) {
        existing.position = position;
        if (content) existing.content = content;
      } else if (existing.setPosition) {
        existing.setPosition(position);
        if (icon && existing.setIcon) existing.setIcon(icon);
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
        content: content || undefined,
      });
      if (typeof opts.onClick === "function") {
        marker.addListener?.("gmp-click", opts.onClick);
      }
    } else {
      marker = new window.google.maps.Marker({
        position,
        map: mapRef.current,
        title: opts.title || "",
        icon: icon || undefined,
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
      try { if (m.setMap) m.setMap(null); else if ("map" in m) m.map = null; } catch {}
      markersRef.current.delete(key);
    }
  }, []);

  // Kendi marker'ı (self)
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

  // Self UI canlı güncellemeleri (pil / pusula / isim / yüzde)
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
  }, [selfDisplayName, batteryLevel, headingDeg]);

  // Arkadaş marker'ları
  useEffect(() => {
    if (gmapsStatus !== "ready") return;

    const liveKeys = new Set();
    friendsOnMap.forEach((f) => {
      if (typeof f.longitude === "number" && typeof f.latitude === "number") {
        const key = f.uid;
        liveKeys.add(key);
        upsertMarker(key, { lat: f.latitude, lng: f.longitude }, {
          title: f.kullaniciAdi || f.displayName || "Arkadaş",
          avatarUrl: f.avatarUrl || "/avatars/avatar 1.png",
          heightPx: 60,
          onClick: () => { if (typeof onUserClick === "function") onUserClick({ uid: f.uid }); },
        });
      }
    });

    Array.from(markersRef.current.keys()).forEach((key) => {
      if (key === SELF_MARKER_KEY || key === SELECTED_MARKER_KEY) return;
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
        setSearchText("");

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
      {/* placeholder’ı beyaz yapmak için küçük stil enjeksiyonu */}
      <style>{`
        .mylasa-search-input::placeholder { color: rgba(255,255,255,0.8); }
        .mylasa-search-scroll::-webkit-scrollbar { width: 6px; }
        .mylasa-search-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 4px; }
      `}</style>

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
        {/* Avatar: şeffaf siyah daire içinde, img contain */}
        <button
          onClick={() => setIsAvatarModalOpen(true)}
          title="Avatarını Değiştir"
          style={{ ...darkCircleBtn, padding: 4, overflow: "hidden" }}
        >
          <img
            src={selfAvatarUrl}
            alt="avatar"
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              objectFit: "contain",
              objectPosition: "center",
              display: "block",
            }}
          />
        </button>

        <button style={darkCircleBtn} onClick={() => setIsSettingsModalOpen(true)} title="Konum Ayarları">
          <SettingsIcon size={22} color="#fff" />
        </button>

        <div style={{ position: "relative" }}>
          <button style={darkCircleBtn} onClick={() => setIsStyleMenuOpen((v) => !v)} title="Harita Katmanları">
            <LayersIcon size={22} color="#fff" />
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
                  onClick={() => { setMapType(MAP_TYPES[label]); setIsStyleMenuOpen(false); }}
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

        {/* Arama — İKON TOGGLE */}
        <button
          style={darkCircleBtn}
          onClick={() => {
            if (isSearchOpen) {
              setIsSearchOpen(false);
              setSearchText("");
              setPredictions([]);
            } else {
              setIsSearchOpen(true);
              setSearchText("");
              setPredictions([]);
              setTimeout(measureInput, 0);
            }
          }}
          title="Yer Ara"
        >
          <SearchIcon size={22} color="#fff" />
        </button>
      </div>

      {/* Sağ-alt FAB: Konumuma Git */}
      <button
        style={{
          position: "absolute",
          right: 14,
          bottom: `calc(${fabBottom + FAB_EXTRA_LIFT}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 20,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.28)",
          border: "0",
          boxShadow: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
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
          // iOS pusula izni için kullanıcı etkileşimi gerekiyorsa bu tık yardımcı olur
          try {
            const D = window.DeviceOrientationEvent;
            if (D && typeof D.requestPermission === "function") {
              D.requestPermission().catch(() => {});
            }
          } catch {}
        }}
        title="Konumuma git"
        aria-label="Konumuma git"
      >
        <LocateIcon size={28} color="#fff" weight="bold" />
      </button>

      {/* Arama paneli */}
      {isSearchOpen && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 0,
            right: 0,
            zIndex: 20,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "auto",
          }}
        >
          <div style={{ width: inputWidth }}>
            {/* Üst bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 10px",
                gap: 8,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                borderRadius: 22,
                boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
              }}
            >
              <SearchIcon size={18} color="#fff" />
              <input
                className="mylasa-search-input"
                autoFocus
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Yer ara…"
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  fontSize: 16,
                  background: "transparent",
                  color: "#fff",
                }}
              />
              <button
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchText("");
                  setPredictions([]);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  color: "#fff",
                  lineHeight: 1,
                }}
                title="Kapat"
              >
                ✖
              </button>
            </div>

            {/* Öneriler */}
            {predictions.length > 0 && (
              <div
                className="mylasa-search-scroll"
                style={{
                  marginTop: 8,
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                {predictions.map((p) => (
                  <button
                    key={p.place_id}
                    onClick={() => handleSelectPrediction(p)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.18)",
                      cursor: "pointer",
                      color: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {p.structured_formatting?.main_text || p.description}
                    </div>
                    {p.structured_formatting?.secondary_text && (
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {p.structured_formatting.secondary_text}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* gizli ölçüm span'i (input genişliği için) */}
          <span
            ref={sizerRef}
            style={{
              position: "absolute",
              visibility: "hidden",
              whiteSpace: "pre",
              fontSize: 16,
              fontFamily: "inherit",
              fontWeight: 400,
            }}
          />
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
            borderTop: "1px solid #efefef", padding: "8px 10px",
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
