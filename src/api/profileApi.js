// src/api/profileApi.js
import { db } from "../firebase";
import {
  doc, getDoc, collection, query, where, getDocs, limit
} from "firebase/firestore";

/** Kullanıcı adını kanonik biçime çevir (boşlukları at, küçük harf) */
export const slugifyUsername = (raw) => {
  if (!raw) return "";
  const s = decodeURIComponent(String(raw)).trim();
  // Harf/sayı/altçizgi/nokta dışını at; boşlukları kaldır
  const cleaned = s
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_.]/g, "");
  return cleaned.toLowerCase();
};

const shapeUser = (uid, data) => {
  if (!data) return null;
  return {
    id: uid,
    username: data.kullaniciAdi || data.username || "",
    displayName: data.adSoyad || data.displayName || "",
    bio: data.bio || "",
    website: data.website || "",
    avatar: data.profilFoto || data.photoURL || "",
    postsCount: data.postsCount ?? data.statuses_count ?? 0,
    followersCount: data.followersCount ?? (Array.isArray(data.takipciler) ? data.takipciler.length : 0),
    followingCount: data.followingCount ?? (Array.isArray(data.takipEdilenler) ? data.takipEdilenler.length : 0),
    reputation: data.reputation || 0,
  };
};

/**
 * /u/:username için kullanıcı getirir.
 * Boşluk, büyük-küçük, altçizgi, nokta varyantlarını da dener.
 */
export async function getUserByUsername(input) {
  if (!input) return null;

  const raw = decodeURIComponent(String(input));
  const base = raw.trim();
  const lower = base.toLowerCase();
  const nospace = base.replace(/\s+/g, "");
  const unders = base.replace(/\s+/g, "_");
  const dots   = base.replace(/\s+/g, ".");

  const candidates = new Set([
    base, lower, nospace, unders, dots,
    nospace.toLowerCase(), unders.toLowerCase(), dots.toLowerCase(),
    slugifyUsername(base)
  ]);

  // 1) usernames/{usernameLower} -> uid -> users/{uid}
  for (const cand of candidates) {
    try {
      const mapSnap = await getDoc(doc(db, "usernames", cand));
      if (mapSnap.exists()) {
        const uid = mapSnap.data().uid;
        const uSnap = await getDoc(doc(db, "users", uid));
        if (uSnap.exists()) return shapeUser(uid, uSnap.data());
      }
    } catch (_) {}
  }

  // 2) users koleksiyonunda alan bazlı denemeler (mevcutsa)
  try {
    const usersCol = collection(db, "users");
    const tryFields = ["kullaniciAdi", "username", "kullaniciAdi_lower"];
    for (const f of tryFields) {
      for (const cand of candidates) {
        try {
          const q = query(usersCol, where(f, "==", cand), limit(1));
          const qs = await getDocs(q);
          if (!qs.empty) {
            const d = qs.docs[0];
            return shapeUser(d.id, d.data());
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  return null;
}
