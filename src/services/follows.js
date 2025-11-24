// src/services/follows.js
// Takip servisleri: users/{uid}/following + kök /follows üzerinden
// Hepsi/Takip filtresi için takip edilen kullanıcı uid’lerini döndürür.

import { db } from "../firebase";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";

const TTL_MS = 60_000;

let cacheUid = null;
let cacheUids = [];
let cacheExpiresAt = 0;

/**
 * Aktif kullanıcının takip ettiği kullanıcı uid’lerini döndürür.
 * - Önce users/{uid}/following alt koleksiyonuna bakar.
 * - Ardından kök /follows (followerId → followeeId) koleksiyonuna bakar (varsa).
 * - Sonuçlar hafif cache’lenir (60 sn).
 *
 * @param {string} viewerId
 * @param {{force?: boolean}} opts
 * @returns {Promise<string[]>}
 */
export async function getFollowingUids(viewerId, opts = {}) {
  if (!viewerId) return [];
  const { force = false } = opts;
  const now = Date.now();

  if (!force && cacheUid === viewerId && cacheExpiresAt > now) {
    return cacheUids;
  }

  const set = new Set();

  // 1) users/{uid}/following
  try {
    const base = collection(db, `users/${viewerId}/following`);
    const snap = await getDocs(query(base, limit(500)));
    snap.forEach((d) => {
      set.add(String(d.id));
    });
  } catch (e) {
    console.error("following (users/*/following) okunamadı:", e);
  }

  // 2) kök /follows (varsa)
  try {
    const base = collection(db, "follows");
    const snap = await getDocs(
      query(base, where("followerId", "==", viewerId), limit(1000))
    );
    snap.forEach((d) => {
      const x = d.data() || {};
      if (x.followeeId) {
        set.add(String(x.followeeId));
      }
    });
  } catch (e) {
    console.error("following (/follows) okunamadı:", e);
  }

  const arr = Array.from(set);
  cacheUid = viewerId;
  cacheUids = arr;
  cacheExpiresAt = Date.now() + TTL_MS;

  return arr;
}

export default {
  getFollowingUids,
};
