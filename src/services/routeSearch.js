// src/services/routeSearch.js
// Public + finished rotaları filtre/sırala + sayfala.

import { db, auth } from "../firebase";
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, doc, updateDoc
} from "firebase/firestore";

// Haversine (metre)
function toRad(d) { return (d * Math.PI) / 180; }
function distanceMeters(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
  const x = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Eksik meta’ları (areas/centroid) SADECE SAHİBİ açıkken tembel doldur
async function backfillMetaIfOwner(routeSnap) {
  try {
    const d = routeSnap.data();
    const routeId = routeSnap.id;
    const needAreas = !d.areas || typeof d.areas !== "object";
    const needCentroid = !d.centroid || typeof d.centroid.lat !== "number" || typeof d.centroid.lng !== "number";
    if (!needAreas && !needCentroid) return;

    const u = auth.currentUser;
    if (!u || u.uid !== d.ownerId) return;

    const next = {};
    if (needAreas) next.areas = { city: "", admin1: "", country: "", countryCode: "" };

    if (needCentroid) {
      if (d.bounds && typeof d.bounds.n === "number") {
        next.centroid = { lat: (d.bounds.n + d.bounds.s) / 2, lng: (d.bounds.e + d.bounds.w) / 2 };
      } else if (Array.isArray(d.path) && d.path.length > 0) {
        let slat = 0, slng = 0, n = 0;
        for (const p of d.path) {
          if (typeof p?.lat === "number" && typeof p?.lng === "number") { slat += p.lat; slng += p.lng; n++; }
          if (n > 5000) break;
        }
        if (n > 0) next.centroid = { lat: slat / n, lng: slng / n };
      }
    }

    if (Object.keys(next).length) await updateDoc(doc(db, "routes", routeId), next);
  } catch {}
}

/**
 * @param {{
 *  tags?: string[],
 *  city?: string,
 *  country?: string,
 *  distRange?: [number, number], // km
 *  durRange?: [number, number],  // dakika
 *  sort?: 'new'|'top'|'popular'|'nearby',
 *  cursor?: any,
 *  near?: { lat:number, lng:number, city?: string } | null
 * }} opts
 * @returns {Promise<{items:any[], nextCursor:any|null}>}
 */
export async function searchRoutes(opts = {}) {
  const {
    tags = [],
    city = "",
    country = "",
    distRange = [0, 9999],
    durRange  = [0, 1e9],
    sort = "new",
    cursor = null,
    near = null,
  } = opts;

  const routesRef = collection(db, "routes");
  const qx = [
    where("visibility", "==", "public"),
    where("status", "==", "finished"),
  ];

  const ts = (Array.isArray(tags) ? tags : [])
    .map(t => String(t).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
  if (ts.length) qx.push(where("tags", "array-contains-any", ts));

  if (city && city.trim()) qx.push(where("areas.city", "==", city.trim()));
  if (country && country.trim()) {
    const cc = country.trim();
    if (cc.length === 2) qx.push(where("areas.countryCode", "==", cc.toUpperCase()));
    else qx.push(where("areas.country", "==", cc));
  }

  const dMin = Math.max(0, (distRange?.[0] ?? 0)) * 1000;
  const dMax = Math.max(dMin, (distRange?.[1] ?? 9999) * 1000);
  const tMin = Math.max(0, (durRange?.[0] ?? 0)) * 60 * 1000;
  const tMax = Math.max(tMin, (durRange?.[1] ?? 1e9)) * 60 * 1000;

  const hasDistRange = !(dMin === 0 && dMax >= 9999 * 1000);
  const hasDurRange  = !(tMin === 0 && tMax >= 1e9 * 60 * 1000);

  if (hasDistRange) { qx.push(where("totalDistanceM", ">=", dMin)); qx.push(where("totalDistanceM", "<=", dMax)); }
  if (hasDurRange)  { qx.push(where("durationMs", ">=", tMin));    qx.push(where("durationMs", "<=", tMax));    }

  const orders = [];
  if (hasDistRange) orders.push(orderBy("totalDistanceM", "asc"));
  if (hasDurRange && !hasDistRange) orders.push(orderBy("durationMs", "asc"));

  if (sort === "top") {
    orders.push(orderBy("ratingAvg", "desc"));
    orders.push(orderBy("ratingCount", "desc"));
    orders.push(orderBy("createdAt", "desc"));
  } else if (sort === "popular") {
    orders.push(orderBy("ratingCount", "desc"));
    orders.push(orderBy("createdAt", "desc"));
  } else {
    orders.push(orderBy("createdAt", "desc")); // 'new' & 'nearby'
  }

  if (cursor) orders.push(startAfter(cursor));
  orders.push(limit(20));

  let snap;
  try {
    snap = await getDocs(query(routesRef, ...qx, ...orders));
  } catch (e) {
    try {
      const fallback = [where("visibility", "==", "public"), where("status", "==", "finished"), orderBy("createdAt", "desc"), limit(20)];
      snap = await getDocs(query(routesRef, ...fallback));
    } catch (e2) {
      console.error("routeSearch error:", e2);
      return { items: [], nextCursor: null };
    }
  }

  const items = [];
  for (const d of snap.docs) {
    const data = d.data();
    let ratingAvg = typeof data.ratingAvg === "number" ? data.ratingAvg : null;
    if (ratingAvg == null && typeof data.ratingSum === "number" && typeof data.ratingCount === "number" && data.ratingCount > 0) {
      ratingAvg = data.ratingSum / data.ratingCount;
    }
    items.push({ id: d.id, ...data, ratingAvg: ratingAvg ?? 0 });
    backfillMetaIfOwner(d);
  }

  if (sort === "nearby" && near && typeof near.lat === "number" && typeof near.lng === "number") {
    // Basit yakınlık: opsiyonel city eşleşmesi
    let filtered = items;
    if (near.city && items.length) {
      filtered = items.filter(r => (r.areas?.city || "").toLowerCase() === near.city.toLowerCase());
      if (filtered.length === 0) filtered = items; // şehir bulunamadıysa hepsini sırala
    }
    filtered.forEach(r => {
      const c = r.centroid || {};
      r.__distM = (typeof c.lat === "number" && typeof c.lng === "number")
        ? distanceMeters({ lat: near.lat, lng: near.lng }, { lat: c.lat, lng: c.lng })
        : Number.POSITIVE_INFINITY;
    });
    filtered.sort((a, b) => (a.__distM - b.__distM));
    // yakınlıkta ilk sayfa client-sıralı
    return { items: filtered, nextCursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : null };
  }

  const last = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
  return { items, nextCursor: last };
}
