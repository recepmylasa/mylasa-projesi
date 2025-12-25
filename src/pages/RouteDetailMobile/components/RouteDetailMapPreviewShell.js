// src/pages/RouteDetailMobile/components/RouteDetailMapPreviewShell.js
import React, { useMemo } from "react";
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

  const overlayBase = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.86)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    zIndex: 5,
  };

  const card = {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    boxShadow: "0 10px 26px rgba(0,0,0,0.10)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const title = { fontWeight: 900, fontSize: 14, color: "#111" };
  const desc = { fontSize: 12, color: "rgba(0,0,0,0.72)", lineHeight: 1.35 };

  const btnRow = { display: "flex", gap: 10, flexWrap: "wrap" };

  const retryBtn = {
    height: 38,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    flex: "1 1 140px",
  };

  const ghostBtn = {
    height: 38,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#fff",
    color: "#111",
    fontWeight: 900,
    cursor: "pointer",
    flex: "1 1 140px",
  };

  const spinner = {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: "2px solid rgba(0,0,0,0.12)",
    borderTopColor: "rgba(0,0,0,0.65)",
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
      {/* Harita/preview içeriği (tek source of truth) */}
      <RouteDetailMapPreview
        routeId={routeId}
        gmapsStatus={gmapsStatus}
        mapDivRef={mapDivRef}
        mapRef={mapRef}
        path={path}
        stops={stops}
        stopsLoaded={stopsLoaded}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div style={overlayBase} aria-live="polite" aria-busy="true">
          <style>{`
            @keyframes rdmpspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={spinner} />
              <div>
                <div style={title}>Harita yükleniyor…</div>
                <div style={desc}>Bağlantı yavaşsa biraz sürebilir.</div>
              </div>
            </div>
            <div style={btnRow}>
              <button
                type="button"
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
        <div style={overlayBase} role="alert">
          <div style={card}>
            <div>
              <div style={title}>Harita açılamadı</div>
              <div style={desc}>{messageForError()}</div>
            </div>

            <div style={btnRow}>
              <button
                type="button"
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
