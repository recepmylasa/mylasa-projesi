// src/services/viewportRoutes.js
// ADIM 30: fetchViewportRoutes için audience=following boş ise erken dönüş + basit metin araması için searchRoutes eklendi.
// Viewport tabanlı rota sorgusu (Yakınımda 2.0 – sadece public & finished)
// Filtre + sıralama + "Hepsi / Takip" audience destekli

import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit as qlimit,
  getDocs,
} from "firebase/firestore";
import { geohashQueryBounds, distanceBetween } from "geofire-common";

function hasValidBounds(bounds) {
  if (!bounds) return false;
  const { n, s, e, w } = bounds;
  return [n, s, e, w].every(
    (v) => typeof v === "number" && !Number.isNaN(v)
  );
}

// Dikdörtgen viewport'u kapsayan dairesel geohash aralıkları
function rectToGeohashBounds(bounds) {
  if (!hasValidBounds(bounds)) return [];
  const { n, s, e, w } = bounds;
  const centerLat = (n + s) / 2;
  const centerLng = (e + w) / 2;
  const center = [centerLat, centerLng];

  // Merkezden köşelere en büyük mesafe (km)
  const cornerDistKm = Math.max(
    distanceBetween(center, [n, e]),
    distanceBetween(center, [n, w]),
    distanceBetween(center, [s, e]),
    distanceBetween(center, [s, w])
  );

  const radiusM = Math.max(10, cornerDistKm * 1000); // metre
  return geohashQueryBounds(center, radiusM);
}

function normalizeViewportFilters(raw) {
  const base = {
    city: "",
    cc: "",
    minRating: 0,
    minVotes: 0,
    minDur: 0,
    maxDur: 0,
    sort: "distance",
  };
  if (!raw) return base;

  const toPosNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  let sort = (raw.sort || base.sort || "").toString();
  if (!["rating", "votes", "new", "distance"].includes(sort)) {
    sort = base.sort;
  }

  return {
    city: (raw.city || "").toString().trim(),
    cc: (raw.cc || raw.countryCode || "").toString().trim().toUpperCase(),
    minRating: toPosNum(raw.minRating),
    minVotes: toPosNum(raw.minVotes),
    minDur: toPosNum(raw.minDur),
    maxDur: toPosNum(raw.maxDur),
    sort,
  };
}

function createdAtSeconds(it) {
  const ts = it?.createdAt;
  if (ts && typeof ts.seconds === "number") return ts.seconds;
  return 0;
}

/**
 * Viewport tabanlı rotaları getirir.
 *
 * @param {object} params
 * @param {{n:number,s:number,e:number,w:number}} params.bounds
 * @param {number} [params.limit]
 * @param {{lat:number,lng:number}} [params.userLocation]
 * @param {{
 *   city?: string,
 *   cc?: string,
 *   minRating?: number,
 *   minVotes?: number,
 *   minDur?: number,
 *   maxDur?: number,
 *   sort?: "distance"|"rating"|"votes"|"new"
 * }} [params.filters]
 * @param {"distance"|"rating"|"votes"|"new"} [params.sort]
 * @param {"all"|"following"} [params.audience]
 * @param {string[]} [params.followingUids]
 *
 * @returns {Promise<{routes: any[], stats: {fetched:number, deduped:number}}>}
 */
export async function fetchViewportRoutes({
  bounds,
  limit = 200,
  userLocation,
  filters,
  sort,
  audience = "all",
  followingUids,
}) {
  if (!hasValidBounds(bounds)) {
    return { routes: [], stats: { fetched: 0, deduped: 0 } };
  }

  const limitVal = Math.max(1, Math.min(Number(limit) || 0 || 200, 200));

  // Filtreleri normalize et
  const vf = normalizeViewportFilters({ ...(filters || {}), sort });

  const audienceNorm = audience === "following" ? "following" : "all";
  const followingArr = Array.isArray(followingUids)
    ? followingUids
        .map((id) => String(id || "").trim())
        .filter((id) => id.length > 0)
    : [];
  const hasFollowing =
    audienceNorm === "following" && followingArr.length > 0;

  // ADIM 30: Takip modunda hiç takip yoksa doğrudan boş liste döndür.
  if (audienceNorm === "following" && !hasFollowing) {
    return { routes: [], stats: { fetched: 0, deduped: 0 } };
  }

  const col = collection(db, "routes");
  const map = new Map();
  let fetched = 0;

  // --- 1) Takip modu, takip sayısı 1–10 arası → ownerId "in" stratejisi ---
  if (hasFollowing && followingArr.length <= 10) {
    const chunkSize = 10;
    for (let i = 0; i < followingArr.length; i += chunkSize) {
      const chunk = followingArr.slice(i, i + chunkSize);
      if (!chunk.length) continue;

      const qy = query(
        col,
        where("status", "==", "finished"),
        where("ownerId", "in", chunk),
        orderBy("createdAt", "desc"),
        qlimit(limitVal * 3) // filtreler sonrası için biraz fazla al
      );
      const snap = await getDocs(qy);
      fetched += snap.size;
      snap.forEach((d) => {
        const data = d.data();
        const visibility = (data.visibility || "public").toString();
        if (visibility !== "public") return; // sadece public rotalar
        if ((data.status || "").toString() !== "finished") return;
        map.set(d.id, { id: d.id, ...data });
      });
    }
  } else {
    // --- 2) Hepsi veya takip sayısı >10 → viewport/geohash stratejisi ---
    const ghBounds = rectToGeohashBounds(bounds);
    if (!ghBounds.length) {
      return { routes: [], stats: { fetched: 0, deduped: 0 } };
    }

    // Her geohash aralığı için makul limit
    const per = Math.max(5, Math.ceil(limitVal / ghBounds.length));

    const proms = ghBounds.map(([start, end]) => {
      const qy = query(
        col,
        where("status", "==", "finished"),
        where("routeGeo.geohash", ">=", start),
        where("routeGeo.geohash", "<=", end),
        orderBy("routeGeo.geohash"),
        orderBy("createdAt", "desc"),
        qlimit(per)
      );
      return getDocs(qy);
    });

    const snaps = await Promise.all(proms);

    for (const snap of snaps) {
      fetched += snap.size;
      snap.forEach((d) => {
        const data = d.data();
        const visibility = (data.visibility || "public").toString();
        if (visibility !== "public") return; // sadece public rotalar
        if ((data.status || "").toString() !== "finished") return;

        map.set(d.id, { id: d.id, ...data });
      });
    }
  }

  let routes = Array.from(map.values());

  // Viewport’a gerçekten düşen merkezleri bırak (ownerId "in" sorgusunda da geçerli)
  const { n, s, e, w } = bounds;
  routes = routes.filter((r) => {
    const c = r?.routeGeo?.center;
    if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng))
      return false;
    const lat = c.lat;
    const lng = c.lng;
    const latOk = lat >= s && lat <= n;
    let lngOk;
    if (e >= w) {
      lngOk = lng >= w && lng <= e;
    } else {
      // Uluslararası tarih çizgisi vakası (muhtemelen bizde yok ama sağlam olsun)
      lngOk = lng >= w || lng <= e;
    }
    return latOk && lngOk;
  });

  // Takip filtresi (geohash yolunda >10 uid fallback’i için kritik)
  if (hasFollowing) {
    const followSet = new Set(followingArr);
    routes = routes.filter((r) => {
      const owner =
        r.ownerId ||
        r.userId ||
        r.uid ||
        r.ownerUID ||
        r.ownerUid ||
        r.userUID;
      if (!owner) return false;
      return followSet.has(String(owner));
    });
  }

  const hasUserLocation =
    userLocation &&
    Number.isFinite(userLocation.lat) &&
    Number.isFinite(userLocation.lng);

  // Kullanıcının konumu varsa distanceKm ekle
  if (hasUserLocation) {
    routes = routes.map((r) => {
      const c = r?.routeGeo?.center;
      if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) {
        return { ...r, distanceKm: null };
      }
      const km = distanceBetween(
        [userLocation.lat, userLocation.lng],
        [c.lat, c.lng]
      );
      return { ...r, distanceKm: km };
    });
  } else {
    // distanceKm yoksa null bırak
    routes = routes.map((r) => ({
      ...r,
      distanceKm:
        typeof r.distanceKm === "number" ? r.distanceKm : null,
    }));
  }

  // --- Post-filterler (şehir/ülke, rating, oy, süre) ---
  if (vf.city) {
    const wantedCity = vf.city.toLowerCase();
    routes = routes.filter((r) => {
      const city = (r?.areas?.city || "")
        .toString()
        .toLowerCase();
      return city === wantedCity;
    });
  }

  if (vf.cc) {
    const wantedCc = vf.cc.toUpperCase();
    routes = routes.filter((r) => {
      const areas = r?.areas || {};
      const cc = (
        areas.countryCode ||
        areas.cc ||
        areas.country ||
        areas.countryName ||
        ""
      )
        .toString()
        .toUpperCase();
      return cc.includes(wantedCc);
    });
  }

  if (vf.minRating || vf.minVotes) {
    routes = routes.filter((r) => {
      const ratingAvg = Number(r.ratingAvg || r.avgRating || 0);
      const ratingCount = Number(r.ratingCount || r.votes || 0);
      if (vf.minRating && (!ratingAvg || ratingAvg < vf.minRating)) {
        return false;
      }
      if (vf.minVotes && (!ratingCount || ratingCount < vf.minVotes)) {
        return false;
      }
      return true;
    });
  }

  if (vf.minDur || vf.maxDur) {
    const minMs = vf.minDur > 0 ? vf.minDur * 60000 : 0;
    const maxMs = vf.maxDur > 0 ? vf.maxDur * 60000 : 0;
    routes = routes.filter((r) => {
      const dur = Number(r.durationMs || 0);
      if (minMs && (!dur || dur < minMs)) return false;
      if (maxMs && dur > maxMs) return false;
      return true;
    });
  }

  // --- Sıralama ---
  routes.sort((a, b) => {
    const ratingA = Number(a.ratingAvg || a.avgRating || 0);
    const ratingB = Number(b.ratingAvg || b.avgRating || 0);
    const votesA = Number(a.ratingCount || a.votes || 0);
    const votesB = Number(b.ratingCount || b.votes || 0);
    const createdA = createdAtSeconds(a);
    const createdB = createdAtSeconds(b);

    if (vf.sort === "rating") {
      if (ratingB !== ratingA) return ratingB - ratingA;
      if (votesB !== votesA) return votesB - votesA;
      return createdB - createdA;
    }

    if (vf.sort === "votes") {
      if (votesB !== votesA) return votesB - votesA;
      if (ratingB !== ratingA) return ratingB - ratingA;
      return createdB - createdA;
    }

    if (vf.sort === "new") {
      if (createdB !== createdA) return createdB - createdA;
      if (ratingB !== ratingA) return ratingB - ratingA;
      return votesB - votesA;
    }

    // varsayılan: distance
    const distA =
      typeof a.distanceKm === "number"
        ? a.distanceKm
        : Number.POSITIVE_INFINITY;
    const distB =
      typeof b.distanceKm === "number"
        ? b.distanceKm
        : Number.POSITIVE_INFINITY;
    if (distA !== distB) return distA - distB;
    if (ratingB !== ratingA) return ratingB - ratingA;
    if (votesB !== votesA) return votesB - votesA;
    return createdB - createdA;
  });

  const deduped = routes.length;
  if (routes.length > limitVal) {
    routes = routes.slice(0, limitVal);
  }

  return { routes, stats: { fetched, deduped } };
}

/**
 * Basit metin araması (ADIM 30 / DIM 34)
 *
 * @param {object} params
 * @param {string} params.query
 * @param {number} [params.limit]
 * @param {"all"|"following"} [params.audience]
 * @param {string[]} [params.followingUids]
 * @param {"new"|"likes"|"rating"} [params.sort]
 * @param {AbortSignal} [params.signal]
 *
 * @returns {Promise<{routes:any[]}>}
 */
export async function searchRoutes({
  query: queryText,
  limit = 60,
  audience = "all",
  followingUids,
  sort = "new",
  signal,
} = {}) {
  const raw = (queryText || "").toString();
  const trimmed = raw.trim();
  if (!trimmed) {
    return { routes: [] };
  }

  const needle = trimmed.toLowerCase();
  const col = collection(db, "routes");
  const limitVal = Math.max(1, Math.min(Number(limit) || 60, 200));

  const audienceNorm = audience === "following" ? "following" : "all";
  const followingArr = Array.isArray(followingUids)
    ? followingUids
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    : [];
  const hasFollowing =
    audienceNorm === "following" && followingArr.length > 0;

  // Takip modunda hiç takip yoksa direkt boş
  if (audienceNorm === "following" && !hasFollowing) {
    return { routes: [] };
  }

  if (signal?.aborted) {
    return { routes: [] };
  }

  const map = new Map();

  const collectSnap = (snap) => {
    snap.forEach((d) => {
      const data = d.data();
      const visibility = (data.visibility || "public").toString();
      if (visibility !== "public") return;
      if ((data.status || "").toString() !== "finished") return;
      map.set(d.id, { id: d.id, ...data });
    });
  };

  // Takip modunda az sayıda kullanıcı için ownerId "in" sorgusu
  if (hasFollowing && followingArr.length <= 10) {
    const chunkSize = 10;
    for (let i = 0; i < followingArr.length; i += chunkSize) {
      if (signal?.aborted) {
        return { routes: [] };
      }
      const chunk = followingArr.slice(i, i + chunkSize);
      if (!chunk.length) continue;

      const qy = query(
        col,
        where("status", "==", "finished"),
        where("ownerId", "in", chunk),
        orderBy("createdAt", "desc"),
        qlimit(limitVal * 3)
      );
      const snap = await getDocs(qy);
      if (signal?.aborted) {
        return { routes: [] };
      }
      collectSnap(snap);
    }
  } else {
    // Hepsi veya takip sayısı >10 → sadece son rotalar üzerinden text search
    const qy = query(
      col,
      where("status", "==", "finished"),
      orderBy("createdAt", "desc"),
      qlimit(limitVal * 5)
    );
    const snap = await getDocs(qy);
    if (signal?.aborted) {
      return { routes: [] };
    }
    collectSnap(snap);
  }

  let routes = Array.from(map.values());

  // Takip filtresi (fallback: >10 takipli senaryo)
  if (hasFollowing && followingArr.length > 10) {
    const followSet = new Set(followingArr);
    routes = routes.filter((r) => {
      const owner =
        r.ownerId ||
        r.userId ||
        r.uid ||
        r.ownerUID ||
        r.ownerUid ||
        r.userUID;
      if (!owner) return false;
      return followSet.has(String(owner));
    });
  }

  // Metin eşleşmesi (başlık, açıklama, şehir/ülke, etiketler)
  routes = routes.filter((r) => {
    const title = (r.title || "").toString().toLowerCase();
    const desc = (r.description || r.desc || "")
      .toString()
      .toLowerCase();
    const city = (r?.areas?.city || "").toString().toLowerCase();
    const areas = r?.areas || {};
    const country = (
      areas.countryName ||
      areas.country ||
      areas.countryCode ||
      areas.cc ||
      ""
    )
      .toString()
      .toLowerCase();
    const tagsArr = Array.isArray(r.tags) ? r.tags : [];
    const tagsText = tagsArr.join(" ").toString().toLowerCase();

    const haystack = `${title} ${desc} ${city} ${country} ${tagsText}`;
    return haystack.includes(needle);
  });

  // Sıralama (new / likes / rating)
  routes.sort((a, b) => {
    const ratingA = Number(a.ratingAvg || a.avgRating || 0);
    const ratingB = Number(b.ratingAvg || b.avgRating || 0);
    const votesA = Number(a.ratingCount || a.votes || 0);
    const votesB = Number(b.ratingCount || b.votes || 0);
    const createdA = createdAtSeconds(a);
    const createdB = createdAtSeconds(b);

    if (sort === "rating") {
      if (ratingB !== ratingA) return ratingB - ratingA;
      if (votesB !== votesA) return votesB - votesA;
      return createdB - createdA;
    }

    if (sort === "likes") {
      if (votesB !== votesA) return votesB - votesA;
      if (ratingB !== ratingA) return ratingB - ratingA;
      return createdB - createdA;
    }

    // varsayılan: en yeni
    if (createdB !== createdA) return createdB - createdA;
    if (ratingB !== ratingA) return ratingB - ratingA;
    return votesB - votesA;
  });

  if (routes.length > limitVal) {
    routes = routes.slice(0, limitVal);
  }

  return { routes };
}

export default fetchViewportRoutes;
