// src/pages/RouteDetailMobile/components/RouteDetailMapPreviewShell.js
import React from "react";
import { useGoogleMaps } from "../../../hooks/useGoogleMaps";
import RouteDetailMapPreview from "./RouteDetailMapPreview";

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID = (process.env.REACT_APP_GMAPS_MAP_ID || "").trim();

export default function RouteDetailMapPreviewShell({
  routeId,
  path,
  stops,
  stopsLoaded,
  onRetry,
}) {
  const { gmapsStatus, mapDivRef, mapRef } = useGoogleMaps({ API_KEY, MAP_ID });

  const isReady = gmapsStatus === "ready";
  const isError = gmapsStatus === "error";
  const isLoading = !isReady && !isError;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <RouteDetailMapPreview
        routeId={routeId}
        gmapsStatus={gmapsStatus}
        mapDivRef={mapDivRef}
        mapRef={mapRef}
        path={path}
        stops={stops}
        stopsLoaded={stopsLoaded}
      />

      {/* Overlay UX (Adım 4 mantığı: loading + error + retry) */}
      {(isLoading || isError) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            style={{
              width: "min(360px, 92%)",
              borderRadius: 16,
              border: "1px solid #eee",
              background: "#fff",
              boxShadow: "0 10px 28px rgba(0,0,0,.10)",
              padding: 14,
            }}
          >
            {isLoading && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: "2px solid #e5e7eb",
                      borderTopColor: "#111",
                      animation: "mylasaSpin .9s linear infinite",
                    }}
                    aria-hidden="true"
                  />
                  <div style={{ fontWeight: 900, fontSize: 14, color: "#111" }}>
                    Harita yükleniyor…
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div style={{ height: 10, borderRadius: 999, background: "#f3f4f6" }} />
                  <div style={{ height: 10, borderRadius: 999, background: "#f3f4f6", width: "78%" }} />
                  <div style={{ height: 10, borderRadius: 999, background: "#f3f4f6", width: "64%" }} />
                </div>

                <div style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>
                  Bağlantın yavaşsa birkaç saniye sürebilir.
                </div>

                <style>{`@keyframes mylasaSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
              </>
            )}

            {isError && (
              <>
                <div style={{ fontWeight: 950, fontSize: 14, color: "#111" }}>
                  Harita yüklenemedi
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                  Bağlantını kontrol edip tekrar deneyebilirsin.
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof onRetry === "function") onRetry();
                    }}
                    style={{
                      borderRadius: 12,
                      border: "1px solid #111",
                      background: "#111",
                      color: "#fff",
                      padding: "10px 12px",
                      fontWeight: 900,
                      cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    Tekrar dene
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
