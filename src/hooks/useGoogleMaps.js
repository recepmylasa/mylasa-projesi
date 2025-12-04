// src/hooks/useGoogleMaps.js
import { useCallback, useEffect, useRef, useState } from "react";

const GMAPS_SCRIPT_ID = "gmaps-js-sdk";
let _gmapsPromise = null;

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

function removeExistingGMapsScript() {
  const s = document.getElementById(GMAPS_SCRIPT_ID);
  if (s && s.parentNode) s.parentNode.removeChild(s);
  _gmapsPromise = null;
}

function loadGoogleMaps(API_KEY) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!API_KEY) return Promise.reject(new Error("NO_API_KEY"));
  if (_gmapsPromise) return _gmapsPromise;

  _gmapsPromise = new Promise((resolve, reject) => {
    removeExistingGMapsScript();

    let resolved = false;
    window.mylasaInitMap = async () => {
      try {
        if (window.google?.maps?.importLibrary) {
          const markerLib = await window.google.maps.importLibrary("marker");
          if (markerLib && !window.google.maps.marker) {
            window.google.maps.marker = markerLib;
          }
          try {
            await window.google.maps.importLibrary("places");
          } catch {}
        }
        if (!window.google?.maps?.Map) throw new Error("LIB_NOT_READY");
        resolved = true;
        resolve(window.google.maps);
      } catch (e) {
        reject(e);
      } finally {
        try {
          delete window.mylasaInitMap;
        } catch {}
      }
    };

    const script = document.createElement("script");
    script.id = GMAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = buildGMapsUrl(API_KEY);
    script.onerror = () => reject(new Error("NETWORK_OR_BLOCKED"));
    document.head.appendChild(script);

    setTimeout(() => {
      if (!resolved) reject(new Error("TIMEOUT"));
    }, 20000);
    window.gm_authFailure = () => reject(new Error("AUTH_FAILED"));
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

  const attemptLoad = useCallback(
    async (force = false) => {
      if (force) removeExistingGMapsScript();

      if (!API_KEY) {
        setGmapsStatus("no-key");
        setErrorMsg(".env içinde REACT_APP_GOOGLE_MAPS_API_KEY yok.");
        setError(new Error("NO_API_KEY"));
        return;
      }

      setGmapsStatus("loading");
      setErrorMsg("");
      setError(null);

      try {
        const gmaps = await loadGoogleMaps(API_KEY);

        if (!mapRef.current && mapDivRef.current) {
          const opts = {
            center: { lat: 39.0, lng: 35.0 },
            zoom: 5,
            mapTypeId: "roadmap",
            disableDefaultUI: true,
            clickableIcons: true,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: "greedy",
          };
          if (MAP_ID) opts.mapId = MAP_ID;
          mapRef.current = new gmaps.Map(mapDivRef.current, opts);
        }

        advancedAllowedRef.current =
          !!(window.google?.maps?.marker?.AdvancedMarkerElement) && !!MAP_ID;

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
        setError(null);
      } catch (err) {
        let msg = err?.message || "Harita yüklenemedi.";
        let finalError = err instanceof Error ? err : new Error(msg);

        if (msg === "NO_API_KEY") {
          setGmapsStatus("no-key");
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
    [API_KEY, MAP_ID]
  );

  const reload = useCallback(() => {
    setError(null);
    setErrorMsg("");
    setGmapsStatus("idle");
    removeExistingGMapsScript();
    setReloadKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!mapDivRef.current) return;
    if (gmapsStatus !== "idle") return;
    attemptLoad();
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
