// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreview.js
import React from "react";

/**
 * NOTE (Tek Otorite Kuralı):
 * Route map çizimi/marker/fitBounds/resize yönetimi artık tamamen
 * RouteDetailMapPreviewShell.js içinde yapılıyor.
 *
 * Bu component bilerek "no-op" bırakıldı ki:
 * - aynı map instance'a çift fitBounds/resize basılmasın
 * - polyline/marker iki kez çizilmesin
 * - mobilde freeze + tıklamama (gesture layer kilidi) tetiklenmesin
 */
export default function RouteDetailMapPreview() {
  return null;
}
