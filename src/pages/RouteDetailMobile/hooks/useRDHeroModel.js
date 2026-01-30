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
  ownerId,
}) {
  const ratingAvgLabel = useMemo(
    () => getRouteRatingLabelSafe(routeModel),
    [routeModel]
  );

  const stats = useMemo(
    () => (routeModel ? buildStatsFromRoute(routeModel) : null),
    [routeModel]
  );

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

  const title = useMemo(() => {
    try {
      const m = routeModel || {};
      const raw = (m?.title || m?.name || "").toString();
      const t = raw.replace(/\s+/g, " ").trim();
      if (!t) return "";
      if (t.toLowerCase() === "rota") return "";
      return t;
    } catch {
      return "";
    }
  }, [routeModel]);

  const heroTitle = title;

  const routeDescText = useMemo(() => {
    try {
      const m = routeModel || {};
      const raw =
        m?.description ||
        m?.summary ||
        m?.text ||
        m?.about ||
        m?.notes ||
        "";
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
      const b =
        district && city && city.toLowerCase() !== district.toLowerCase()
          ? city
          : "";

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

  const heroCategory = useMemo(() => {
    const MAX_LEN = 12;

    const isBad = (v) => {
      const x = String(v || "").trim().toLowerCase();
      if (!x) return true;
      if (
        x === "unknown" ||
        x === "-" ||
        x === "n/a" ||
        x === "na" ||
        x === "null" ||
        x === "undefined"
      )
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

  // ✅ Avatar: profil → locked → route
  const ownerAvatarUrl = useMemo(() => {
    const m = routeModel || {};
    const locked = lockedOwnerDoc || {};
    const fetched = owner || {};

    const pick = (v) => (v && String(v).trim() ? String(v).trim() : "");

    const fetchedA =
      pick(fetched?.photoURL) ||
      pick(fetched?.photoUrl) ||
      pick(fetched?.profilFoto) ||
      pick(fetched?.profilResmi) ||
      pick(fetched?.avatar) ||
      "";

    const cachedA =
      pick(locked?.photoURL) ||
      pick(locked?.photoUrl) ||
      pick(locked?.profilFoto) ||
      pick(locked?.profilResmi) ||
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

  // ✅ PROFİL PARİTESİ: username/handle ÖNCE, sonra displayName/ad-soyad
  const ownerName = useMemo(() => {
    const isBad = (s) => {
      const x = String(s || "").trim().toLowerCase();
      if (!x) return true;
      // yasak placeholder’lar
      if (
        x === "yazar" ||
        x === "author" ||
        x === "unknown" ||
        x === "kullanıcı" ||
        x === "kullanici" ||
        x === "user"
      )
        return true;
      return false;
    };

    const norm = (v) => String(v || "").trim();

    const m = routeModel || {};
    const locked = lockedOwnerDoc || {};
    const fetched = owner || {};

    // 1) Profilde görünen şey genelde username/handle -> bunu ÖNCE dene
    const primaryCandidates = [
      fetched?.kullaniciAdi,
      fetched?.kullaniciadi,
      fetched?.username,
      fetched?.userName,
      fetched?.handle,
      fetched?.nick,
      fetched?.screenName,

      locked?.kullaniciAdi,
      locked?.kullaniciadi,
      locked?.username,
      locked?.userName,
      locked?.handle,
      locked?.nick,
      locked?.screenName,

      // route snapshot alanları (varsa)
      m?.ownerUsername,
      m?.ownerKullaniciAdi,
      m?.ownerKullaniciadi,
      m?.ownerHandle,
      m?.ownerUserName,
    ];

    // 2) Sonra displayName / ad-soyad vb.
    const secondaryCandidates = [
      fetched?.displayName,
      fetched?.adSoyad,
      fetched?.adiSoyadi,
      fetched?.fullName,
      fetched?.name,
      fetched?.isim,
      fetched?.firstName,
      fetched?.lastName,

      locked?.displayName,
      locked?.adSoyad,
      locked?.adiSoyadi,
      locked?.fullName,
      locked?.name,
      locked?.isim,
      locked?.firstName,
      locked?.lastName,

      m?.ownerDisplayName,
      m?.ownerName,
      m?.ownerFullName,
    ];

    const all = [...primaryCandidates, ...secondaryCandidates]
      .filter((x) => x != null)
      .map(norm)
      .filter(Boolean);

    for (const c of all) {
      if (!isBad(c)) return c;
    }

    // ✅ güvenli fallback
    const id = norm(resolvedOwnerId);
    if (id) {
      const short = id.slice(-4).toUpperCase();
      return `Kullanıcı • ${short}`;
    }
    return "Kullanıcı";
  }, [owner, lockedOwnerDoc, routeModel, resolvedOwnerId]);

  // ✅ owner state machine (loading/ready/fallback) — alan seti genişletildi
  const ownerState = useMemo(() => {
    const hasAnyIdentity = (o) => {
      if (!o) return false;
      const s = (v) => (typeof v === "string" ? v.trim() : "");
      return !!(
        s(o.kullaniciAdi) ||
        s(o.kullaniciadi) ||
        s(o.username) ||
        s(o.userName) ||
        s(o.handle) ||
        s(o.nick) ||
        s(o.screenName) ||
        s(o.displayName) ||
        s(o.name) ||
        s(o.fullName) ||
        s(o.adSoyad) ||
        s(o.adiSoyadi) ||
        s(o.isim) ||
        s(o.photoURL) ||
        s(o.photoUrl) ||
        s(o.profilFoto) ||
        s(o.profilResmi) ||
        s(o.avatar)
      );
    };

    const fetched = owner || null;
    const locked = lockedOwnerDoc || null;

    if (hasAnyIdentity(fetched)) return "ready";
    if (hasAnyIdentity(locked)) return "fallback";

    const m = routeModel || {};
    const hasRoutePreview =
      !!String(m?.ownerName || "").trim() ||
      !!String(m?.ownerUsername || "").trim() ||
      !!String(m?.ownerKullaniciAdi || "").trim() ||
      !!String(m?.ownerKullaniciadi || "").trim() ||
      !!String(m?.ownerDisplayName || "").trim() ||
      !!String(m?.ownerHandle || "").trim() ||
      !!String(ownerAvatarUrl || "").trim();

    if (hasRoutePreview) return "fallback";
    if (String(resolvedOwnerId || "").trim()) return "fallback";

    return "loading";
  }, [owner, lockedOwnerDoc, routeModel, ownerAvatarUrl, resolvedOwnerId]);

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

  const heroExplorerCount = useMemo(() => {
    try {
      const m = routeModel || {};
      const pickNum = (v) => {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const pickArrLen = (v) => (Array.isArray(v) ? v.length : null);

      const candidates = [
        pickNum(m?.explorersCount),
        pickNum(m?.explorerCount),
        pickNum(m?.kasifCount),
        pickNum(m?.kasifSayisi),
        pickNum(m?.uniqueExplorers),
        pickNum(m?.visitsCount),
        pickNum(m?.viewsCount),
        pickNum(m?.stats?.explorers),
        pickArrLen(m?.explorers),
        pickArrLen(m?.visitors),
        pickNum(heroRatingInfo?.count),
      ].filter((x) => x != null);

      const n = candidates.length ? candidates[0] : 0;
      return Math.max(0, Math.floor(Number(n) || 0));
    } catch {
      return 0;
    }
  }, [routeModel, heroRatingInfo]);

  const heroExplorerLabel = useMemo(() => {
    const cat = String(heroCategory || "Macera").trim() || "Macera";
    const n = Math.max(0, Number(heroExplorerCount) || 0);
    return `${cat}: ${n} Kaşif`;
  }, [heroCategory, heroExplorerCount]);

  return {
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

    heroCategory,
    heroTitle,
    heroRatingInfo,
    heroStarsModel,
    heroExplorerLabel,
    ownerName,
    ownerAvatarUrl,
    ownerState,
    timeAgoLine,

    mapAreaLabel,
    mapBadgeCount,
    routeDescText,
  };
}
