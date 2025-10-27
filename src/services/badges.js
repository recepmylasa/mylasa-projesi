// src/services/badges.js
// Catalog fetch + user badges listener + small helpers

import { db } from "../firebase";
import {
  collection, doc, getDocs, onSnapshot, orderBy, query
} from "firebase/firestore";

let _catalogCache = null;
let _catalogLoadedAt = 0;
const CATALOG_TTL = 10 * 60 * 1000; // 10 dk

export async function fetchBadgeCatalog(force = false) {
  const now = Date.now();
  if (!force && _catalogCache && now - _catalogLoadedAt < CATALOG_TTL) return _catalogCache;

  const snap = await getDocs(query(collection(db, "badge_catalog"), orderBy("order", "asc")));
  const arr = [];
  snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
  _catalogCache = arr;
  _catalogLoadedAt = now;
  return arr;
}

export function watchUserBadges(uid, cb) {
  const col = collection(db, "users", uid, "badges");
  const q = query(col, orderBy("earnedAt", "desc"));
  return onSnapshot(q, (snap) => {
    const arr = [];
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
    cb(arr);
  });
}

export async function getUserBadgesOnce(uid) {
  const col = collection(db, "users", uid, "badges");
  const q = query(col, orderBy("earnedAt", "desc"));
  const snap = await getDocs(q);
  const arr = [];
  snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
  return arr;
}

// İlk 3 rozeti (earnedAt desc) döndür
export async function getTopBadges(uid, n = 3) {
  const arr = await getUserBadgesOnce(uid);
  return arr.slice(0, n);
}
