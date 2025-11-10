// Yakınımdaki rotalar için servis (MOBİL)
import { db } from "../firebase";
import {
  collection, query, where, orderBy, limit, getDocs,
} from "firebase/firestore";
import { geohashQueryBounds, distanceBetween } from "geofire-common";

let _following = new Set();
let _viewerId = null;

export async function initNearby(viewerId) {
  _viewerId = viewerId || null;
  _following = new Set();

  if (!_viewerId) return;

  // 1) users/{uid}/following alt koleksiyonu (varsa)
  try {
    const base = collection(db, `users/${_viewerId}/following`);
    const snap = await getDocs(query(base, limit(200)));
    snap.forEach((d) => _following.add(d.id));
  } catch {}

  // 2) kök /follows (varsa)
  try {
    const base = collection(db, "follows");
    const snap = await getDocs(query(base, where("followerId", "==", _viewerId), limit(400)));
    snap.forEach((d) => {
      const x = d.data() || {};
      if (x.followeeId) _following.add(String(x.followeeId));
    });
  } catch {}
}

function canSeeRoute(route) {
  const v = (route?.visibility || "public").toString();
  if (v === "public") return true;
  if (v === "followers") {
    const owner = route?.ownerId || route?.userId || route?.uid || route?.ownerUID;
    if (!_viewerId || !owner) return false;
    return _following.has(String(owner));
  }
  // varsayılan güvenli davranış
  return false;
}

export async function fetchNearbyPage({ center, radiusKm = 20, take = 20 }) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    return { items: [], stats: { fetched: 0, kept: 0 } };
  }
  const radiusM = radiusKm * 1000;
  const bounds = geohashQueryBounds([center.lat, center.lng], radiusM);

  // Sorguları paralel ama makul sayıda yap
  const per = Math.max(5, Math.ceil(take / bounds.length));
  const proms = bounds.map(([start, end]) => {
    const qy = query(
      collection(db, "routes"),
      where("status", "==", "finished"),
      where("routeGeo.geohash", ">=", start),
      where("routeGeo.geohash", "<=", end),
      orderBy("routeGeo.geohash"),
      orderBy("createdAt", "desc"),
      limit(per)
    );
    return getDocs(qy);
  });

  const snaps = await Promise.all(proms);

  // Birleştir + tekilleştir
  const map = new Map();
  let fetched = 0;
  for (const s of snaps) {
    fetched += s.size;
    s.forEach((d) => {
      const val = d.data();
      map.set(d.id, { id: d.id, ...val });
    });
  }

  // Haversine ile yarıçap dışını ele + görünürlük filtresi
  const withDist = [];
  for (const it of map.values()) {
    const c = it?.routeGeo?.center;
    if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const distKm = distanceBetween([center.lat, center.lng], [c.lat, c.lng]);
    if (distKm <= radiusKm + 0.2 /* tolerans */ && canSeeRoute(it)) {
      withDist.push({ ...it, distanceKm: distKm });
    }
  }

  // Mesafeye göre sırala ve limit uygula
  withDist.sort((a, b) => a.distanceKm - b.distanceKm);
  const items = withDist.slice(0, take);

  return { items, stats: { fetched, kept: items.length } };
}
