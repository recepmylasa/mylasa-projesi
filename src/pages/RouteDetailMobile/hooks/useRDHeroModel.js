// FILE: src/pages/RouteDetailMobile/hooks/useRDHeroModel.js
import { useMemo } from "react";
import {
  buildStatsFromRoute,
  formatAvgSpeedFromStats,
  formatDateTimeTR,
  formatDistanceFromStats,
  formatDurationFromStats,
  formatStopsFromStats,
  formatTimeAgo,
  getAudienceFromRoute,
  getRouteRatingLabelSafe,
  getRouteTitleSafe,
} from "../routeDetailUtils";

export default function useRDHeroModel({ routeModel, owner, lockedOwnerDoc, stopsForPreview }) {
  const ratingAvgLabel = useMemo(() => getRouteRatingLabelSafe(routeModel), [routeModel]);
  const stats = useMemo(() => (routeModel ? buildStatsFromRoute(routeModel) : null), [routeModel]);

  const { key: audienceKey, label: audienceLabel } = useMemo(() => getAudienceFromRoute(routeModel || {}), [routeModel]);

  const dateText = useMemo(() => formatDateTimeTR(routeModel?.finishedAt || routeModel?.createdAt), [routeModel]);

  const distanceText = formatDistanceFromStats(stats);
  const durationText = formatDurationFromStats(stats);
  const stopsText = formatStopsFromStats(stats);
  const avgSpeedText = formatAvgSpeedFromStats(stats);

  const metaLine = useMemo(() => {
    const bits = [];
    if (dateText) bits.push(dateText);
    if (distanceText) bits.push(distanceText);
    if (durationText) bits.push(durationText);
    if (stopsText) bits.push(stopsText);
    if (avgSpeedText) bits.push(avgSpeedText);
    return bits.join(" · ");
  }, [dateText, distanceText, durationText, stopsText, avgSpeedText]);

  const title = useMemo(() => getRouteTitleSafe(routeModel), [routeModel]);

  // ✅ EMIR 3 — Hero title: route.title/name öncelikli, süre gibi string’leri reddet
  const heroTitle = useMemo(() => {
    try {
      const m = routeModel || {};
      const candidates = [m?.title, m?.name, m?.routeTitle, m?.routeName, m?.displayTitle, m?.caption, m?.heading]
        .filter(Boolean)
        .map((x) => String(x).trim())
        .filter(Boolean);

      const normalize = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const looksLikeDurationOnly = (s) => {
        const x = normalize(s).toLowerCase();
        if (!x) return true;
        if (/^(rota\s*)?\d{1,2}:\d{2}(:\d{2})?$/.test(x)) return true;
        return false;
      };

      for (const c of candidates) {
        const s = normalize(c);
        if (!s) continue;
        if (looksLikeDurationOnly(s)) continue;
        return s;
      }

      const fb = normalize(title);
      if (fb && !looksLikeDurationOnly(fb)) return fb;

      return "Rota";
    } catch {
      return title || "Rota";
    }
  }, [routeModel, title]);

  // ✅ EMIR 3 — kısa açıklama (pill altı)
  const routeDescText = useMemo(() => {
    try {
      const m = routeModel || {};
      const raw = m?.description || m?.summary || m?.text || m?.about || m?.notes || "";
      if (typeof raw !== "string") return "";
      return raw.trim();
    } catch {
      return "";
    }
  }, [routeModel]);

  // ✅ EMIR 2 — Map label (BODRUM / MUĞLA gibi)
  const mapAreaLabel = useMemo(() => {
    try {
      const m = routeModel || {};
      const cityRaw =
        m?.city || m?.province || m?.il || m?.state || m?.region || m?.locationCity || m?.location?.city || "";
      const districtRaw = m?.district || m?.ilce || m?.town || m?.locationDistrict || m?.location?.district || "";

      const city = String(cityRaw || "").trim();
      const district = String(districtRaw || "").trim();

      const a = district || city;
      const b = district && city && city.toLowerCase() !== district.toLowerCase() ? city : "";

      const out = [a, b].filter(Boolean).join(" / ");
      return out ? out.toUpperCase() : "";
    } catch {
      return "";
    }
  }, [routeModel]);

  const mapBadgeCount = useMemo(() => {
    try {
      const n = Array.isArray(stopsForPreview) ? stopsForPreview.length : 0;
      return Math.max(0, Math.min(2, n));
    } catch {
      return 0;
    }
  }, [stopsForPreview]);

  // ✅ Hero category
  const heroCategory = useMemo(() => {
    try {
      const m = routeModel || {};
      const raw =
        m?.category ||
        m?.routeCategory ||
        m?.type ||
        m?.routeType ||
        m?.activity ||
        m?.kind ||
        (Array.isArray(m?.tags) && m.tags.length ? m.tags[0] : "") ||
        "";

      const s = String(raw || "").trim();
      if (!s) return "";
      return s.toUpperCase();
    } catch {
      return "";
    }
  }, [routeModel]);

  const ownerName = useMemo(() => {
    const o = owner || lockedOwnerDoc || {};
    const s =
      (o?.name && String(o.name).trim()) ||
      (o?.fullName && String(o.fullName).trim()) ||
      (o?.username && String(o.username).trim()) ||
      (o?.userName && String(o.userName).trim()) ||
      (o?.handle && String(o.handle).trim()) ||
      (routeModel?.ownerName && String(routeModel.ownerName).trim()) ||
      (routeModel?.ownerUsername && String(routeModel.ownerUsername).trim()) ||
      "Yazar";
    return s || "Yazar";
  }, [owner, lockedOwnerDoc, routeModel]);

  const ownerAvatarUrl = useMemo(() => {
    const o = owner || lockedOwnerDoc || {};
    const s =
      (o?.photoURL && String(o.photoURL).trim()) ||
      (o?.profilFoto && String(o.profilFoto).trim()) ||
      (o?.avatar && String(o.avatar).trim()) ||
      (routeModel?.ownerAvatar && String(routeModel.ownerAvatar).trim()) ||
      "";
    return s || "";
  }, [owner, lockedOwnerDoc, routeModel]);

  const timeAgoText = useMemo(() => formatTimeAgo(routeModel?.finishedAt || routeModel?.createdAt), [routeModel]);

  const timeAgoLine = useMemo(() => {
    const t = String(timeAgoText || "").trim();
    if (!t) return "";
    if (t.toLowerCase().includes("paylaşıldı")) return t;
    return `${t} paylaşıldı`;
  }, [timeAgoText]);

  // ✅ EMİR 1 — Hero rating parse + 5★ visual
  const heroRatingInfo = useMemo(() => {
    try {
      const labelRaw = String(ratingAvgLabel || "").trim();
      const label = labelRaw.replace(",", ".");
      let avg = null;
      let count = null;

      const mAvg = label.match(/(\d+(?:\.\d+)?)/);
      if (mAvg && mAvg[1]) {
        const v = parseFloat(mAvg[1]);
        if (Number.isFinite(v)) avg = v;
      }

      const mCountParen = label.match(/\((\d+)\)/);
      if (mCountParen && mCountParen[1]) {
        const n = parseInt(mCountParen[1], 10);
        if (Number.isFinite(n)) count = n;
      } else {
        const mCountAlt = label.match(/(\d+)\s*(?:oy|vote|değerlendirme)/i);
        if (mCountAlt && mCountAlt[1]) {
          const n = parseInt(mCountAlt[1], 10);
          if (Number.isFinite(n)) count = n;
        }
      }

      let badgeText = "";
      if (typeof avg === "number" && Number.isFinite(avg)) {
        const a = Math.max(0, Math.min(5, avg));
        badgeText = count != null ? `${a.toFixed(1)} (${count})` : `${a.toFixed(1)}`;
      } else {
        badgeText = labelRaw || "—";
      }

      return { avg, count, badgeText };
    } catch {
      return { avg: null, count: null, badgeText: String(ratingAvgLabel || "—") };
    }
  }, [ratingAvgLabel]);

  const heroStarsModel = useMemo(() => {
    const avg = heroRatingInfo?.avg;
    if (typeof avg !== "number" || !Number.isFinite(avg)) return { full: 0, half: false, empty: 5 };
    const a = Math.max(0, Math.min(5, avg));
    const baseFull = Math.floor(a);
    const rem = a - baseFull;

    const bumpFull = rem >= 0.75 ? 1 : 0;
    const half = rem >= 0.25 && rem < 0.75;

    const full = Math.min(5, baseFull + bumpFull);
    const halfOn = full < 5 && half;

    const empty = Math.max(0, 5 - full - (halfOn ? 1 : 0));
    return { full, half: halfOn, empty };
  }, [heroRatingInfo]);

  return {
    // header / meta
    ratingAvgLabel,
    stats,
    audienceKey,
    audienceLabel,
    metaLine,
    title,
    distanceText,
    durationText,
    stopsText,
    avgSpeedText,

    // hero
    heroCategory,
    heroTitle,
    heroRatingInfo,
    heroStarsModel,
    ownerName,
    ownerAvatarUrl,
    timeAgoLine,

    // map + desc
    mapAreaLabel,
    mapBadgeCount,
    routeDescText,
  };
}
