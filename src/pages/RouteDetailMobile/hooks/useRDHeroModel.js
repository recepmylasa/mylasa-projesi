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
} from "../routeDetailUtils";

export default function useRDHeroModel({
  routeModel,
  owner,
  lockedOwnerDoc,
  stopsForPreview,
  ownerId, // ✅ Paket 02: fallback için
}) {
  const ratingAvgLabel = useMemo(() => getRouteRatingLabelSafe(routeModel), [routeModel]);
  const stats = useMemo(() => (routeModel ? buildStatsFromRoute(routeModel) : null), [routeModel]);

  const { key: audienceKey, label: audienceLabel } = useMemo(
    () => getAudienceFromRoute(routeModel || {}),
    [routeModel]
  );

  const dateText = useMemo(
    () => formatDateTimeTR(routeModel?.finishedAt || routeModel?.createdAt),
    [routeModel]
  );

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

  // ✅ EMİR PAKETİ 2 — TEK TITLE KAYNAĞI
  const title = useMemo(() => {
    try {
      const m = routeModel || {};
      const raw = (m?.title || m?.name || "").toString();
      const t = raw.replace(/\s+/g, " ").trim();
      if (!t) return "";
      if (t.toLowerCase() === "rota") return ""; // ✅ yasak placeholder
      return t;
    } catch {
      return "";
    }
  }, [routeModel]);

  const heroTitle = title;

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

  const mapAreaLabel = useMemo(() => {
    try {
      const m = routeModel || {};
      const cityRaw =
        m?.city ||
        m?.province ||
        m?.il ||
        m?.state ||
        m?.region ||
        m?.locationCity ||
        m?.location?.city ||
        "";
      const districtRaw =
        m?.district ||
        m?.ilce ||
        m?.town ||
        m?.locationDistrict ||
        m?.location?.district ||
        "";

      const city = String(cityRaw || "").trim();
      const district = String(districtRaw || "").trim();

      const a = district || city;
      const b = district && city && city.toLowerCase() !== district.toLowerCase() ? city : "";

      const out = [a, b].filter(Boolean).join(" / ");
      return out ? out.toLocaleUpperCase("tr-TR") : "";
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

  // ✅ EMİR PAKETİ 3 — Kategori pili + “Macera” fallback
  const heroCategory = useMemo(() => {
    const MAX_LEN = 12;

    const isBad = (v) => {
      const x = String(v || "").trim().toLowerCase();
      if (!x) return true;
      if (x === "unknown" || x === "-" || x === "n/a" || x === "na" || x === "null" || x === "undefined")
        return true;
      return false;
    };

    const clean = (v) =>
      String(v || "")
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

    const shorten = (label) => {
      const s = clean(label);
      if (!s) return "Macera";
      if (s.length <= MAX_LEN) return s;

      const firstWord = s.split(" ")[0].trim();
      if (firstWord && firstWord.length <= MAX_LEN) return firstWord;

      const base = firstWord || s;
      const cut = base.slice(0, MAX_LEN).trim();
      return cut || "Macera";
    };

    try {
      const m = routeModel || {};
      const raw =
        m?.categoryLabel ||
        m?.category ||
        m?.type ||
        (Array.isArray(m?.tags) && m.tags.length ? m.tags[0] : "") ||
        "Macera";

      const normalized = clean(raw);
      const safe = isBad(normalized) ? "Macera" : normalized;

      return shorten(safe) || "Macera";
    } catch {
      return "Macera";
    }
  }, [routeModel]);

  const resolvedOwnerId = useMemo(() => {
    try {
      const m = routeModel || {};
      const id =
        ownerId ||
        owner?.id ||
        lockedOwnerDoc?.id ||
        m?.ownerId ||
        m?.owner ||
        null;
      return id ? String(id) : "";
    } catch {
      return "";
    }
  }, [ownerId, owner?.id, lockedOwnerDoc?.id, routeModel]);

  // ✅ EMİR PAKETİ 02 — OwnerName çözüm sırası (profil öncelikli)
  // 1) fetched user doc (owner) — displayName hedefi
  // 2) cached/lockedOwnerDoc
  // 3) route doc içi ownerName/ownerUsername...
  // yoksa: "Kullanıcı • XXXX" (Yazar yasak)
  const ownerName = useMemo(() => {
    const isBad = (s) => {
      const x = String(s || "").trim().toLowerCase();
      if (!x) return true;
      if (x === "yazar" || x === "author" || x === "unknown") return true;
      return false;
    };

    const m = routeModel || {};
    const locked = lockedOwnerDoc || {};
    const fetched = owner || {};

    const candidates = [
      // 1) fetched user doc (profil)
      fetched?.displayName,
      fetched?.name,
      fetched?.fullName,
      fetched?.username,
      fetched?.userName,
      fetched?.handle,

      // 2) locked/cache
      locked?.displayName,
      locked?.name,
      locked?.fullName,
      locked?.username,
      locked?.userName,
      locked?.handle,

      // 3) route preview
      m?.ownerName,
      m?.ownerUsername,
      m?.ownerDisplayName,
      m?.ownerHandle,
    ]
      .filter(Boolean)
      .map((x) => String(x).trim())
      .filter(Boolean);

    for (const c of candidates) {
      if (!isBad(c)) return c;
    }

    // ✅ güvenli fallback (UI asla boş kalmasın)
    const id = String(resolvedOwnerId || "").trim();
    if (id) {
      const short = id.slice(-4).toUpperCase();
      return `Kullanıcı • ${short}`;
    }
    return "Kullanıcı";
  }, [owner, lockedOwnerDoc, routeModel, resolvedOwnerId]);

  // ✅ Avatar: profil → locked → route
  const ownerAvatarUrl = useMemo(() => {
    const m = routeModel || {};
    const locked = lockedOwnerDoc || {};
    const fetched = owner || {};

    const pick = (v) => (v && String(v).trim() ? String(v).trim() : "");

    const fetchedA =
      pick(fetched?.photoURL) ||
      pick(fetched?.profilFoto) ||
      pick(fetched?.avatar) ||
      "";

    const cachedA =
      pick(locked?.photoURL) ||
      pick(locked?.profilFoto) ||
      pick(locked?.avatar) ||
      "";

    const routeA =
      pick(m?.ownerAvatarUrl) ||
      pick(m?.ownerAvatar) ||
      pick(m?.ownerPhotoURL) ||
      pick(m?.ownerPhotoUrl) ||
      pick(m?.ownerPhoto) ||
      "";

    return fetchedA || cachedA || routeA || "";
  }, [owner, lockedOwnerDoc, routeModel]);

  const timeAgoText = useMemo(
    () => formatTimeAgo(routeModel?.finishedAt || routeModel?.createdAt),
    [routeModel]
  );

  const timeAgoLine = useMemo(() => {
    const t = String(timeAgoText || "").trim();
    if (!t) return "";
    if (t.toLowerCase().includes("paylaşıldı")) return t;
    return `${t} paylaşıldı`;
  }, [timeAgoText]);

  // ✅ Avg + count parse (varsa)
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

      return { avg, count };
    } catch {
      return { avg: null, count: null };
    }
  }, [ratingAvgLabel]);

  const heroStarsModel = useMemo(() => {
    const avg = heroRatingInfo?.avg;
    if (typeof avg !== "number" || !Number.isFinite(avg))
      return { full: 0, half: false, empty: 5 };

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
