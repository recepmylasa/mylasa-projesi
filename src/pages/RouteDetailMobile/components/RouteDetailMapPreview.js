// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreview.js
import React from "react";

/**
 * NOTE (Tek Otorite Kuralı):
 * Polyline/marker/fitBounds/resize yönetimi RouteDetailMapPreviewShell.js içinde.
 *
 * Bu component'in tek görevi:
 * - Google Maps'in bağlanacağı DOM container'ı sağlamak (mapDivRef)
 * - Preview map'in scroll/sheet etkileşimini kilitlememesi için input'u minimuma indirmek
 */
export default function RouteDetailMapPreview({ mapDivRef }) {
  return (
    <div
      ref={mapDivRef}
      className="rdmps-map"
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 14,
        overflow: "hidden",
        // Preview map scroll'u/sheet'i kilitlemesin
        touchAction: "pan-y",
        WebkitTapHighlightColor: "transparent",
        // ✅ Preview map input yakalamasın (sheet donması/tıklama kilidi kırıcı)
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
}
