// src/services/routeSearch.js
// Public & finished rotaları sayfalı çeken servis.
// Sıralama: "trending" | "new" | "top"
// Opsiyonel filtre: city, countryCode

import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit as qlimit,
  startAfter,
  getDocs,
} from "firebase/firestore";

function safeAvg(doc) {
  const d = doc || {};
  if (typeof d.ratingAvg === "number") return d.ratingAvg || 0;
  const sum = Number(d.ratingSum || 0);
  const cnt = Number(d.ratingCount || 0);
  return cnt > 0 ? sum / cnt : 0;
}

export async function fetchPublicRoutes({
  order = "trending", // "trending" | "new" | "top"
  city = "",
  countryCode = "",
  limit = 20,
  cursor = null,
} = {}) {
  const col = collection(db, "routes");

  const parts = [
    where("visibility", "==", "public"),
    where("status", "==", "finished"),
  ];

  if (city) parts.push(where("areas.city", "==", city));
  if (countryCode) parts.push(where("areas.countryCode", "==", countryCode));

  // Ana sıralama (Firestore tarafı)
  if (order === "new") {
    parts.push(orderBy("createdAt", "desc"));
  } else if (order === "top") {
    parts.push(orderBy("ratingAvg", "desc"));
    parts.push(orderBy("createdAt", "desc")); // tie-break
  } else {
    // trending: önce ratingCount desc, sonra ratingAvg desc (final sıralama sayfa içinde düzeltilecek)
    parts.push(orderBy("ratingCount", "desc"));
    parts.push(orderBy("ratingAvg", "desc"));
  }

  parts.push(qlimit(Math.max(1, Math.min(limit, 50))));
  if (cursor) parts.push(startAfter(cursor));

  const qy = query(col, ...parts);
  const snap = await getDocs(qy);
  const docs = snap.docs;

  let items = docs.map((d) => {
    const x = d.data() || {};
    const ratingAvg = safeAvg(x);
    return {
      id: d.id,
      ...x,
      ratingAvg,
      _createdAtSec: x?.createdAt?.seconds || 0,
      _ratingCount: Number(x?.ratingCount || 0),
    };
  });

  // trending için sayfa içi hafif skor (eldeki sayfada)
  if (order === "trending") {
    items.sort((a, b) => {
      const sa = a.ratingAvg * Math.log((a._ratingCount || 0) + 1);
      const sb = b.ratingAvg * Math.log((b._ratingCount || 0) + 1);
      if (sb !== sa) return sb - sa;
      // tie-break: createdAt desc
      return (b._createdAtSec || 0) - (a._createdAtSec || 0);
    });
  }

  const nextCursor = docs.length > 0 ? docs[docs.length - 1] : null;
  return { items, nextCursor };
}
