// FILE: src/hooks/useGoogleMaps.js
import { useCallback, useEffect, useRef, useState } from "react";

const GMAPS_SCRIPT_ID = "gmaps-js-sdk";
let _gmapsPromise = null;
let _gmapsLoadSeq = 0;

function buildGMapsUrl(API_KEY) {
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

function removeGMapsScriptElement() {
  try {
    const s = document.getElementById(GMAPS_SCRIPT_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
  } catch {}
}

function cleanupCallbacks() {
  try {
    // callback
    if (window.mylasaInitMap) {
      try {
        delete window.mylasaInitMap;
      } catch {}
      try {
        window.mylasaInitMap = undefined;
      } catch {}
    }
  } catch {}
  try {
    // auth failure callback (google uses this global)
    if (window.gm_authFailure) {
      try {
        delete window.gm_authFailure;
      } catch {}
      try {
        window.gm_authFailure = undefined;
      } catch {}
    }
  } catch {}
}

function hardResetLoader() {
  removeGMapsScriptElement();
  cleanupCallbacks();
  _gmapsPromise = null;
  _gmapsLoadSeq += 1;
}

/**
 * ✅ FIX: Promise executor içinde _gmapsPromise null'lama / script sökme YOK.
 * - force=true => hard reset + fresh load
 * - force=false => eğer promise varsa onu döner; yoksa yeni load başlatır
 */
function loadGoogleMaps(API_KEY, { force = false } = {}) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!API_KEY) return Promise.reject(new Error("NO_API_KEY"));

  if (!force && _gmapsPromise) return _gmapsPromise;

  if (force) hardResetLoader();
  else {
    // Stale/yarım kalan script varsa temizle ama promise'ı burada manipüle etme
    removeGMapsScriptElement();
    cleanupCallbacks();
  }

  const mySeq = ++_gmapsLoadSeq;

  _gmapsPromise = new Promise((resolve, reject) => {
    let done = false;
    let timeoutId = 0;

    const finish = (ok, val) => {
      if (done) return;
      done = true;

      try {
        if (timeoutId) clearTimeout(timeoutId);
      } catch {}

      // stale load ise state bozma
      if (mySeq !== _gmapsLoadSeq) return;

      // callback cleanup
      cleanupCallbacks();

      if (ok) resolve(val);
      else {
        // reject sonrası tekrar denenebilsin diye promise'ı bırak
        try {
          _gmapsPromise = null;
        } catch {}
        reject(val);
      }
    };

    window.mylasaInitMap = async () => {
      try {
        if (window.google?.maps?.importLibrary) {
          try {
            const markerLib = await window.google.maps.importLibrary("marker");
            if (markerLib && !window.google.maps.marker) {
              window.google.maps.marker = markerLib;
            }
          } catch {}
          try {
            await window.google.maps.importLibrary("places");
          } catch {}
        }

        if (!window.google?.maps?.Map) throw new Error("LIB_NOT_READY");
        finish(true, window.google.maps);
      } catch (e) {
        finish(false, e);
      }
    };

    window.gm_authFailure = () => finish(false, new Error("AUTH_FAILED"));

    const script = document.createElement("script");
    script.id = GMAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = buildGMapsUrl(API_KEY);
    script.onerror = () => finish(false, new Error("NETWORK_OR_BLOCKED"));

    try {
      document.head.appendChild(script);
    } catch {
      finish(false, new Error("NETWORK_OR_BLOCKED"));
      return;
    }

    timeoutId = setTimeout(() => {
      finish(false, new Error("TIMEOUT"));
    }, 20000);
  });

  return _gmapsPromise;
}

export function useGoogleMaps({ API_KEY, MAP_ID }) {
  const [gmapsStatus, setGmapsStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const advancedAllowedRef = useRef(false);

  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);

  const isMountedRef = useRef(true);
  const loadAttemptSeqRef = useRef(0);
  const ensureTimersRef = useRef([]);

  const clearEnsureTimers = () => {
    try {
      ensureTimersRef.current.forEach((t) => {
        try {
          clearTimeout(t);
        } catch {}
      });
    } catch {}
    ensureTimersRef.current = [];
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearEnsureTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureMapInstance = useCallback(
    (gmaps) => {
      try {
        if (!gmaps) return false;
        if (mapRef.current) return true;
        if (!mapDivRef.current) return false;

        const opts = {
          center: { lat: 39.0, lng: 35.0 },
          zoom: 5,
          mapTypeId: "roadmap",
          disableDefaultUI: true,
          clickableIcons: true,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
          keyboardShortcuts: false,
        };
        if (MAP_ID) opts.mapId = MAP_ID;

        mapRef.current = new gmaps.Map(mapDivRef.current, opts);

        return !!mapRef.current;
      } catch {
        return false;
      }
    },
    [MAP_ID]
  );

  const initPlacesServices = useCallback(() => {
    try {
      if (!(window.google?.maps && mapRef.current)) return;

      const places = window.google.maps.places;
      if (!places) return;

      if (!autocompleteServiceRef.current) {
        autocompleteServiceRef.current = new places.AutocompleteService();
      }
      if (!placesServiceRef.current) {
        placesServiceRef.current = new places.PlacesService(mapRef.current);
      }
      sessionTokenRef.current = new places.AutocompleteSessionToken();
    } catch {}
  }, []);

  const attemptLoad = useCallback(
    async (force = false) => {
      const myAttempt = ++loadAttemptSeqRef.current;

      clearEnsureTimers();

      if (!API_KEY) {
        setGmapsStatus("missing_key");
        setErrorMsg(".env içinde REACT_APP_GOOGLE_MAPS_API_KEY yok.");
        setError(new Error("NO_API_KEY"));
        return;
      }

      setGmapsStatus("loading");
      setErrorMsg("");
      setError(null);

      try {
        const gmaps = await loadGoogleMaps(API_KEY, { force });

        // Advanced marker ancak MAP_ID varsa
        advancedAllowedRef.current =
          !!(window.google?.maps?.marker?.AdvancedMarkerElement) && !!MAP_ID;

        // ✅ Script yüklendi ama div henüz yoksa: awaiting_div + kısa backoff ile map init
        const createdNow = ensureMapInstance(gmaps);

        if (!createdNow) {
          if (!isMountedRef.current) return;

          setGmapsStatus("awaiting_div");

          let tries = 0;
          const maxTries = 12;

          const tick = () => {
            if (!isMountedRef.current) return;
            if (myAttempt !== loadAttemptSeqRef.current) return;

            if (mapRef.current) {
              try {
                initPlacesServices();
              } catch {}
              setGmapsStatus("ready");
              return;
            }

            const ok = ensureMapInstance(gmaps);
            if (ok && mapRef.current) {
              try {
                initPlacesServices();
              } catch {}
              setGmapsStatus("ready");
              return;
            }

            if (tries < maxTries) {
              tries += 1;
              const t = setTimeout(tick, 80 + tries * 70);
              ensureTimersRef.current.push(t);
            } else {
              // div hiç gelmediyse: loading'a düşürme; user retry ile remount edebilir
              setGmapsStatus("error");
              setErrorMsg("Harita alanı oluşturulamadı.");
              setError(new Error("MAP_DIV_MISSING"));
            }
          };

          const t0 = setTimeout(tick, 80);
          ensureTimersRef.current.push(t0);
          return;
        }

        // services
        initPlacesServices();

        setGmapsStatus("ready");
        setError(null);
      } catch (err) {
        let msg = err?.message || "Harita yüklenemedi.";
        const finalError = err instanceof Error ? err : new Error(msg);

        if (msg === "NO_API_KEY") {
          setGmapsStatus("missing_key");
          msg = "API anahtarı yok (.env).";
        } else if (msg === "AUTH_FAILED") {
          setGmapsStatus("error");
          msg = "Key restrictions hatası (origin/billing).";
        } else if (msg === "NETWORK_OR_BLOCKED") {
          setGmapsStatus("error");
          msg = "Ağ/engelleyici nedeniyle indirilemedi.";
        } else if (msg === "TIMEOUT") {
          setGmapsStatus("error");
          msg = "Google Maps zaman aşımı.";
        } else if (msg === "LIB_NOT_READY") {
          setGmapsStatus("error");
          msg = "Google Maps kütüphanesi hazır değil.";
        } else {
          setGmapsStatus("error");
        }

        setErrorMsg(msg);
        setError(finalError);
      }
    },
    [API_KEY, MAP_ID, ensureMapInstance, initPlacesServices]
  );

  const reload = useCallback(() => {
    clearEnsureTimers();

    try {
      mapRef.current = null;
    } catch {}
    try {
      advancedAllowedRef.current = false;
    } catch {}

    try {
      autocompleteServiceRef.current = null;
      placesServiceRef.current = null;
      sessionTokenRef.current = null;
    } catch {}

    setError(null);
    setErrorMsg("");
    setGmapsStatus("idle");

    hardResetLoader();
    setReloadKey((prev) => prev + 1);
  }, []);

  // ✅ FIX: mapDivRef.current beklemeden script load başlasın
  useEffect(() => {
    if (gmapsStatus !== "idle") return;
    attemptLoad(false);
  }, [attemptLoad, gmapsStatus, reloadKey]);

  return {
    gmapsStatus,
    errorMsg,
    mapDivRef,
    mapRef,
    advancedAllowedRef,
    autocompleteServiceRef,
    placesServiceRef,
    sessionTokenRef,
    attemptLoad,
    error,
    reload,
  };
}
