// FILE: src/pages/RouteDetailMobile/utils/resolveCoverForUi.js
import {
  DEFAULT_ROUTE_COVER_URL,
  normalizeRouteCover,
  resolveRouteCoverUrl,
} from "../routeDetailUtils";

export default function resolveCoverForUi({
  coverLocal,
  routeModel,
  isDefaultCoverUrl,
  normalizeMediaType,
  mediaCacheRef,
  stops,
  coverUpload,
}) {
  // ✅ cover resolve (picked / auto / default)
  const coverResolvedRaw = coverLocal?.url ? coverLocal.url : resolveRouteCoverUrl(routeModel || {});
  const coverResolvedBase = isDefaultCoverUrl(coverResolvedRaw) ? "" : coverResolvedRaw || "";
  const coverKindResolvedBase = coverLocal?.kind ? coverLocal.kind : normalizeRouteCover(routeModel || {}).kind || "default";

  // UI fallback: kapak yoksa -> first stop first photo (cache) -> default
  const toMillisSafe = (v) => {
    try {
      if (!v) return null;
      if (typeof v?.toDate === "function") return v.toDate().getTime();
      if (typeof v?.seconds === "number") return v.seconds * 1000;
      if (typeof v === "number") return v;
      if (v instanceof Date) return v.getTime();
      const d = new Date(v);
      // eslint-disable-next-line no-restricted-globals
      if (isNaN(d.getTime())) return null;
      return d.getTime();
    } catch {
      return null;
    }
  };

  let coverFallbackFromStops = null;
  try {
    const firstStop = (stops || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))[0];
    const sid = firstStop?.id;
    if (sid) {
      const items = mediaCacheRef?.current?.get(sid)?.items || [];
      const imgs = (items || []).filter((m) => normalizeMediaType(m) === "image" && m?.url);
      if (imgs.length) {
        const sorted = imgs.slice().sort((a, b) => {
          const am = toMillisSafe(a?.createdAt);
          const bm = toMillisSafe(b?.createdAt);
          if (am == null && bm == null) return 0;
          if (am == null) return 1;
          if (bm == null) return -1;
          return am - bm;
        });
        coverFallbackFromStops = sorted[0]?.url ? String(sorted[0].url) : null;
      }
    }
  } catch {}

  let coverResolved = coverResolvedBase || "";
  let coverKindUi = coverKindResolvedBase;

  if (!coverResolved) {
    if (coverFallbackFromStops) {
      coverResolved = coverFallbackFromStops;
      coverKindUi = "auto";
    } else {
      coverResolved = (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg";
      coverKindUi = "default";
    }
  }

  const coverIsPlaceholder = !coverResolvedBase;
  const coverPickBtnLabel = coverKindUi === "picked" ? "Kapağı değiştir" : "Kapak seç";
  const coverStatusText = coverUpload?.uploading
    ? `Yükleniyor… ${Number(coverUpload.p) || 0}%`
    : coverKindUi === "picked"
    ? "Seçildi"
    : coverKindUi === "auto"
    ? "Otomatik"
    : "Varsayılan";

  return {
    coverResolvedRaw,
    coverResolvedBase,
    coverKindResolvedBase,
    coverResolved,
    coverKindUi,
    coverIsPlaceholder,
    coverPickBtnLabel,
    coverStatusText,
    DEFAULT_ROUTE_COVER_URL,
  };
}
