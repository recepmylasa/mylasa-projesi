// src/pages/RoutesExploreMobile/components/NearMapPane.jsx
// Yalnızca UI: meta yazısı + harita div'i + "Bu alanda ara" butonu
// + harita hata state'i (ErrorStateMobile).

import React from "react";
import ErrorStateMobile from "./ErrorStateMobile";

function NearMapPane({
  mapDivRef,
  gmapsStatus,
  errorMsg,
  nearMetaText,
  showSearchAreaButton,
  onSearchAreaClick,
}) {
  const isError = gmapsStatus === "error" || gmapsStatus === "no-key";

  return (
    <>
      {nearMetaText && (
        <div
          style={{
            padding: "4px 10px 0",
            fontSize: 11,
            color: "#6b7280",
          }}
        >
          {nearMetaText}
        </div>
      )}

      <div
        className="near-mapWrap"
        style={{
          height: 300,
          borderRadius: 12,
          overflow: "hidden",
          background: "#f1f3f4",
          margin: "4px 10px 8px",
          position: "relative",
        }}
      >
        <div
          ref={mapDivRef}
          style={{ width: "100%", height: "100%" }}
          aria-label="Yakındaki rotalar haritası"
        />

        {gmapsStatus === "loading" && (
          <div
            className="near-skel"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 37%,#f3f4f6 63%)",
              animation: "near-skel-pulse 1.4s ease infinite",
            }}
          />
        )}

        {showSearchAreaButton && !isError && (
          <button
            type="button"
            className="near-search-area-btn"
            onClick={onSearchAreaClick}
          >
            Bu alanda ara
          </button>
        )}
      </div>

      {isError && (
        <ErrorStateMobile
          icon="🗺️"
          title="Harita yüklenemedi"
          description={
            errorMsg ||
            "Google Haritalar şu anda görüntülenemiyor. Birkaç dakika sonra tekrar dene."
          }
        />
      )}
    </>
  );
}

export default NearMapPane;
