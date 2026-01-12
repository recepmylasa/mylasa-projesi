// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreviewShell.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGoogleMaps } from "../../../hooks/useGoogleMaps";
import RouteDetailMapPreview from "./RouteDetailMapPreview";

export default function RouteDetailMapPreviewShell({
  routeId,
  path = [],
  stops = [],
  stopsLoaded = false,
  onRetry = () => {},
}) {
  const API_KEY =
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY ||
    process.env.REACT_APP_GMAPS_API_KEY ||
    process.env.REACT_APP_MAPS_API_KEY ||
    "";

  const MAP_ID =
    process.env.REACT_APP_GMAPS_MAP_ID ||
    process.env.REACT_APP_GOOGLE_MAPS_MAP_ID ||
    process.env.REACT_APP_MAP_ID ||
    "";

  const mapsOpts = useMemo(() => ({ API_KEY, MAP_ID }), [API_KEY, MAP_ID]);

  const gmaps = useGoogleMaps(mapsOpts) || {};

  // Hook farklı isimlerle dönebiliyorsa “tek kaynak” için normalize ediyoruz:
  const gmapsStatus =
    gmaps.gmapsStatus ||
    gmaps.status ||
    (gmaps.isLoaded ? "ready" : gmaps.error ? "error" : "loading");

  const mapDivRef = gmaps.mapDivRef || gmaps.containerRef || gmaps.divRef || null;
  const mapRef = gmaps.mapRef || gmaps.map || null;

  const isReady = gmapsStatus === "ready" || gmapsStatus === "loaded";
  const isError =
    gmapsStatus === "error" ||
    gmapsStatus === "failed" ||
    gmapsStatus === "blocked" ||
    gmapsStatus === "missing_key";

  const isLoading = !isReady && !isError;

  // ✅ EMİR 5: Map "hazır" tetiklerini tek noktadan yönet (fitBounds retry / idle sonrası için)
  const [mapReadyTick, setMapReadyTick] = useState(0);
  const bumpTick = useCallback(() => {
    setMapReadyTick((t) => (t + 1) % 1000000);
  }, []);

  const lastMapInstanceRef = useRef(null);

  // map instance’ı dışarıya “direkt instance” olarak geçiriyoruz (preview daha güvenli yakalasın)
  const mapInstance = useMemo(() => {
    try {
      const m = mapRef?.current ? mapRef.current : mapRef;
      if (m && typeof m.setCenter === "function" && typeof m.fitBounds === "function") return m;
      return null;
    } catch {
      return null;
    }
  }, [mapRef]);

  // ready olduğunda bir tick
  useEffect(() => {
    if (!isReady) return;
    bumpTick();
  }, [isReady, bumpTick]);

  // map instance değişince tick (remount / retry / strict mode durumları)
  useEffect(() => {
    if (!mapInstance) return;
    if (lastMapInstanceRef.current !== mapInstance) {
      lastMapInstanceRef.current = mapInstance;
      bumpTick();
    }
  }, [mapInstance, bumpTick]);

  // container resize → tick (fitBounds’in “0px ölçü” anına takılmasını kırar)
  useEffect(() => {
    const el = mapDivRef && typeof mapDivRef === "object" ? mapDivRef.current : null;
    if (!el) return;

    // ResizeObserver varsa en iyisi
    if (typeof ResizeObserver !== "undefined") {
      try {
        const ro = new ResizeObserver(() => bumpTick());
        ro.observe(el);
        return () => {
          try {
            ro.disconnect();
          } catch {}
        };
      } catch {}
    }

    // fallback: window resize
    const onResize = () => bumpTick();
    try {
      window.addEventListener("resize", onResize);
    } catch {}
    return () => {
      try {
        window.removeEventListener("resize", onResize);
      } catch {}
    };
  }, [mapDivRef, bumpTick]);

  const overlayBase = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 14,

    // ✅ Light tema aynı kalsın; dark override sadece .route-detail-dark altından gelsin
    background: "var(--rdmps-overlay-bg, rgba(255,255,255,0.86))",

    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    zIndex: 5,
  };

  const card = {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,

    // ✅ Dark override: CSS variable üzerinden
    border: "1px solid var(--rdmps-card-border, rgba(0,0,0,0.08))",
    background: "var(--rdmps-card-bg, #fff)",
    boxShadow: "var(--rdmps-card-shadow, 0 10px 26px rgba(0,0,0,0.10))",

    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const title = {
    fontWeight: 900,
    fontSize: 14,
    color: "var(--rdmps-title, #111)",
  };

  const desc = {
    fontSize: 12,
    color: "var(--rdmps-sub, rgba(0,0,0,0.72))",
    lineHeight: 1.35,
  };

  const btnRow = { display: "flex", gap: 10, flexWrap: "wrap" };

  const retryBtn = {
    height: "var(--rdmps-btn-h, 38px)",
    padding: "0 14px",
    borderRadius: 999,

    border: "1px solid var(--rdmps-btn-primary-border, #111)",
    background: "var(--rdmps-btn-primary-bg, #111)",
    color: "var(--rdmps-btn-primary-fg, #fff)",
    boxShadow: "var(--rdmps-btn-primary-shadow, none)",

    fontWeight: 900,
    cursor: "pointer",
    flex: "1 1 140px",
    WebkitTapHighlightColor: "transparent",
  };

  const ghostBtn = {
    height: "var(--rdmps-btn-h, 38px)",
    padding: "0 14px",
    borderRadius: 999,

    border: "1px solid var(--rdmps-btn-ghost-border, rgba(0,0,0,0.12))",
    background: "var(--rdmps-btn-ghost-bg, #fff)",
    color: "var(--rdmps-btn-ghost-fg, #111)",
    boxShadow: "var(--rdmps-btn-ghost-shadow, none)",

    fontWeight: 900,
    cursor: "pointer",
    flex: "1 1 140px",
    WebkitTapHighlightColor: "transparent",
  };

  const spinner = {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: "2px solid var(--rdmps-spin-track, rgba(0,0,0,0.12))",
    borderTopColor: "var(--rdmps-spin-head, rgba(0,0,0,0.65))",
    animation: "rdmpspin 0.9s linear infinite",
    flex: "0 0 auto",
  };

  const messageForError = () => {
    if (!API_KEY) return "Google Maps API anahtarı bulunamadı.";
    const errText = String(gmaps?.error?.message || gmaps?.error || "").toLowerCase();
    if (errText.includes("billing")) return "Harita yüklenemedi (billing / proje ayarı).";
    if (errText.includes("apikey") || errText.includes("api key")) return "Harita yüklenemedi (API anahtarı).";
    if (errText.includes("quota")) return "Harita yüklenemedi (quota limiti).";
    return "Harita yüklenemedi.";
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* ✅ Harita canvas (useGoogleMaps ref mutlaka bir DOM elemente bağlanmalı) */}
      <div
        ref={mapDivRef || undefined}
        className="rdmps-map"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 14,
          overflow: "hidden",
          background: "rgba(0,0,0,0.04)",
        }}
      />

      {/* Harita/preview içeriği (tek source of truth) */}
      <RouteDetailMapPreview
        routeId={routeId}
        gmapsStatus={gmapsStatus}
        mapDivRef={mapDivRef}
        mapRef={mapRef}
        mapInstance={mapInstance}
        mapReadyTick={mapReadyTick}
        path={path}
        stops={stops}
        stopsLoaded={stopsLoaded}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="rdmps-overlay" style={overlayBase} aria-live="polite" aria-busy="true">
          <style>{`
            @keyframes rdmpspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>

          <div className="rdmps-card" style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={spinner} />
              <div>
                <div className="rdmps-title" style={title}>
                  Harita yükleniyor…
                </div>
                <div className="rdmps-sub" style={desc}>
                  Bağlantı yavaşsa biraz sürebilir.
                </div>
              </div>
            </div>

            <div style={btnRow}>
              <button
                type="button"
                className="rdmps-btn rdmps-btn--ghost"
                style={ghostBtn}
                onClick={() => {
                  try {
                    onRetry();
                  } catch {}
                }}
              >
                Yenile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {isError && (
        <div className="rdmps-overlay" style={overlayBase} role="alert">
          <div className="rdmps-card" style={card}>
            <div>
              <div className="rdmps-title" style={title}>
                Harita açılamadı
              </div>
              <div className="rdmps-sub" style={desc}>
                {messageForError()}
              </div>
            </div>

            <div style={btnRow}>
              <button
                type="button"
                className="rdmps-btn rdmps-btn--primary"
                style={retryBtn}
                onClick={() => {
                  try {
                    onRetry();
                  } catch {}
                }}
              >
                Tekrar dene
              </button>

              <button
                type="button"
                className="rdmps-btn rdmps-btn--ghost"
                style={ghostBtn}
                onClick={() => {
                  try {
                    onRetry();
                  } catch {}
                }}
                title="Remount tetikler"
              >
                Yenile
              </button>
            </div>

            {process.env.NODE_ENV !== "production" && gmaps?.error && (
              <div style={{ fontSize: 11, opacity: 0.7, wordBreak: "break-word" }}>
                {String(gmaps?.error?.message || gmaps?.error)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
