// src/pages/RouteDetailMobile/routeDetailCompat.js
import * as routeDetailUtilsNS from "./routeDetailUtils";

// ✅ Backward compatibility: eski import’lar kırılmasın
const _coerceDate = (v) => {
  if (!v) return null;
  try {
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    if (typeof v === "number") return new Date(v);
    if (v instanceof Date) return v;
    const d = new Date(v);
    // eslint-disable-next-line no-restricted-globals
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

export const formatTimeAgo =
  routeDetailUtilsNS.formatTimeAgo ||
  ((v) => {
    const d = _coerceDate(v);
    if (!d) return "";
    const diff = Date.now() - d.getTime();
    const s = Math.max(0, Math.floor(diff / 1000));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const day = Math.floor(h / 24);
    if (s < 20) return "az önce";
    if (m < 60) return `${m} dk`;
    if (h < 24) return `${h} sa`;
    if (day < 7) return `${day} g`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk} hf`;
    const mo = Math.floor(day / 30);
    return `${Math.max(1, mo)} ay`;
  });

export const formatCount =
  routeDetailUtilsNS.formatCount ||
  ((n) => {
    const x = Number(n) || 0;
    if (x < 1000) return String(x);
    if (x < 1_000_000) return `${(x / 1000).toFixed(x < 10_000 ? 1 : 0)}K`.replace(".0K", "K");
    if (x < 1_000_000_000)
      return `${(x / 1_000_000).toFixed(x < 10_000_000 ? 1 : 0)}M`.replace(".0M", "M");
    return `${(x / 1_000_000_000).toFixed(1)}B`.replace(".0B", "B");
  });

export const formatDateTR =
  routeDetailUtilsNS.formatDateTR ||
  ((v) => {
    const d = _coerceDate(v);
    if (!d) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}.${mm}.${yy}`;
  });
