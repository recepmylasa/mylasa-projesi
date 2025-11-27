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
 * @param {{
 *   bounds: {n:number,s:number,e:number,w:number},
 *   limit?: number,
 *   userLocation?: {lat:number,lng:number},
 *   filters?: {
 *     city?: string,
 *     cc?: string,
 *     minRating?: number,
 *     minVotes?: number,
 *     minDur?: number,
 *     maxDur?: number,
 *     sort?: "distance"|"rating"|"votes"|"new"
 *   },
 *   sort?: "distance"|"rating"|"votes"|"new",
 *   audience?: "all"|"following",
 *   followingUids?: string[]
 * }} params
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
      distanceKm: typeof r.distanceKm === "number" ? r.distanceKm : null,
    }));
  }

  // --- Post-filter: city / cc / rating / votes / süre ---
  if (vf.city) {
    const lc = vf.city.toLowerCase();
    routes = routes.filter(
      (r) => (r?.areas?.city || "").toString().toLowerCase() === lc
    );
  }

  if (vf.cc) {
    const ccUpper = vf.cc.toUpperCase();
    routes = routes.filter((r) => {
      const code =
        (r?.areas?.countryCode ||
          r?.areas?.cc ||
          r?.areas?.country ||
          "").toString().toUpperCase();
      return code === ccUpper;
    });
  }

  if (vf.minRating > 0) {
    routes = routes.filter(
      (r) => Number(r.ratingAvg || 0) >= vf.minRating
    );
  }

  if (vf.minVotes > 0) {
    routes = routes.filter(
      (r) => Number(r.ratingCount || 0) >= vf.minVotes
    );
  }

  const minDurMs = vf.minDur > 0 ? vf.minDur * 60000 : 0;
  const maxDurMs = vf.maxDur > 0 ? vf.maxDur * 60000 : 0;

  if (minDurMs || maxDurMs) {
    routes = routes.filter((r) => {
      const dur = Number(r.durationMs || 0);
      if (minDurMs && (!dur || dur < minDurMs)) return false;
      if (maxDurMs && dur > maxDurMs) return false;
      return true;
    });
  }

  // --- Sıralama ---
  const sortKey = vf.sort || "distance";

  routes.sort((a, b) => {
    const ta = createdAtSeconds(a);
    const tb = createdAtSeconds(b);

    if (sortKey === "rating") {
      const ra = Number(a.ratingAvg || 0);
      const rb = Number(b.ratingAvg || 0);
      if (rb !== ra) return rb - ra;

      const ca = Number(a.ratingCount || 0);
      const cb = Number(b.ratingCount || 0);
      if (cb !== ca) return cb - ca;
      return tb - ta;
    }

    if (sortKey === "votes") {
      const ca = Number(a.ratingCount || 0);
      const cb = Number(b.ratingCount || 0);
      if (cb !== ca) return cb - ca;

      const ra = Number(a.ratingAvg || 0);
      const rb = Number(b.ratingAvg || 0);
      if (rb !== ra) return rb - ra;
      return tb - ta;
    }

    if (sortKey === "new") {
      return tb - ta;
    }

    // distance (varsayılan)
    const da =
      typeof a.distanceKm === "number"
        ? a.distanceKm
        : Number.POSITIVE_INFINITY;
    const db =
      typeof b.distanceKm === "number"
        ? b.distanceKm
        : Number.POSITIVE_INFINITY;

    if (da !== db) return da - db;
    return tb - ta;
  });

  const finalRoutes = routes.slice(0, limitVal);

  return {
    routes: finalRoutes,
    stats: { fetched, deduped: finalRoutes.length },
  };
}

/**
 * ADIM 30: Basit metin araması – yalnızca public & finished rotalar.
 *
 * @param {{
 *   query: string,
 *   limit?: number,
 *   audience?: "all"|"following",
 *   followingUids?: string[],
 *   sort?: "near"|"new"|"likes"|"rating"|"most_votes"|"top_rated"
 * }} params
 *
 * @returns {Promise<{routes:any[]}>}
 */
export async function searchRoutes({
  query: rawQuery,
  limit = 50,
  audience = "all",
  followingUids,
  sort = "new",
}) {
  const qText = (rawQuery || "").toString().trim();
  if (!qText) {
    return { routes: [] };
  }

  const limitVal = Math.max(1, Math.min(Number(limit) || 50, 100));

  const colRef = collection(db, "routes");

  const audienceNorm = audience === "following" ? "following" : "all";
  const followingArr = Array.isArray(followingUids)
    ? followingUids
        .map((id) => String(id || "").trim())
        .filter((id) => id.length > 0)
    : [];
  const hasFollowing =
    audienceNorm === "following" && followingArr.length > 0;

  // Takip modunda hiç takip yoksa doğrudan boş döndür.
  if (audienceNorm === "following" && !hasFollowing) {
    return { routes: [] };
  }

  const baseQuery = query(
    colRef,
    where("status", "==", "finished"),
    orderBy("createdAt", "desc"),
    qlimit(limitVal * 4)
  );

  const snap = await getDocs(baseQuery);

  const routesRaw = [];
  const followSet = hasFollowing ? new Set(followingArr) : null;

  snap.forEach((d) => {
    const data = d.data();
    const visibility = (data.visibility || "public").toString();
    if (visibility !== "public") return;
    if ((data.status || "").toString() !== "finished") return;

    if (hasFollowing) {
      const owner =
        data.ownerId ||
        data.userId ||
        data.uid ||
        data.ownerUID ||
        data.ownerUid ||
        data.userUID;
      if (!owner || !followSet.has(String(owner))) return;
    }

    routesRaw.push({ id: d.id, ...data });
  });

  const needle = qText.toLowerCase();

  let routes = routesRaw.filter((r) => {
    const title =
      (r.title ||
        r.name ||
        r.routeName ||
        r.displayName ||
        "").toString().toLowerCase();
    const desc =
      (r.description || r.desc || r.summary || "")
        .toString()
        .toLowerCase();
    const city = (r?.areas?.city || "").toString().toLowerCase();
    return (
      title.includes(needle) ||
      desc.includes(needle) ||
      city.includes(needle)
    );
  });

  const sortKeyRaw = (sort || "new").toString().toLowerCase();
  let sortKey = "new";
  if (
    sortKeyRaw === "likes" ||
    sortKeyRaw === "most_votes" ||
    sortKeyRaw === "votes"
  ) {
    sortKey = "votes";
  } else if (
    sortKeyRaw === "rating" ||
    sortKeyRaw === "top_rated" ||
    sortKeyRaw === "top"
  ) {
    sortKey = "rating";
  } else {
    sortKey = "new";
  }

  routes.sort((a, b) => {
    const ta = createdAtSeconds(a);
    const tb = createdAtSeconds(b);

    if (sortKey === "rating") {
      const ra = Number(a.ratingAvg || 0);
      const rb = Number(b.ratingAvg || 0);
      if (rb !== ra) return rb - ra;

      const ca = Number(a.ratingCount || 0);
      const cb = Number(b.ratingCount || 0);
      if (cb !== ca) return cb - ca;
      return tb - ta;
    }

    if (sortKey === "votes") {
      const ca = Number(a.ratingCount || 0);
      const cb = Number(b.ratingCount || 0);
      if (cb !== ca) return cb - ca;

      const ra = Number(a.ratingAvg || 0);
      const rb = Number(b.ratingAvg || 0);
      if (rb !== ra) return rb - ra;
      return tb - ta;
    }

    // "new"
    return tb - ta;
  });

  const final = routes.slice(0, limitVal);
  return { routes: final };
}

export default fetchViewportRoutes;
