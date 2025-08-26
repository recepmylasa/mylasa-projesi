// src/api/profileApi.js
// Kullanıcıyı Firestore'dan username/kullaniciAdi alanına göre getirir ve beklenen shape'e dönüştürür.

import { db } from "../firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

export async function getUserByUsername(username) {
  if (!username) return null;

  // 1) kullaniciAdi
  const q1 = query(
    collection(db, "users"),
    where("kullaniciAdi", "==", username),
    limit(1)
  );
  const s1 = await getDocs(q1);
  if (!s1.empty) return normalizeUser(s1.docs[0]);

  // 2) username (alternatif alan adı)
  const q2 = query(
    collection(db, "users"),
    where("username", "==", username),
    limit(1)
  );
  const s2 = await getDocs(q2);
  if (!s2.empty) return normalizeUser(s2.docs[0]);

  return null;
}

function normalizeUser(docSnap) {
  const d = docSnap.data() || {};
  const followersCount =
    d.followersCount ??
    d.followers_count ??
    (Array.isArray(d.takipciler) ? d.takipciler.length : 0);
  const followingCount =
    d.followingCount ??
    d.following_count ??
    (Array.isArray(d.takipEdilenler) ? d.takipEdilenler.length : 0);
  const postsCount = d.postsCount ?? d.statuses_count ?? d.gonderiSayisi ?? 0;

  return {
    id: docSnap.id,
    username: d.username || d.kullaniciAdi || "",
    displayName: d.displayName || d.adSoyad || d.fullName || "",
    avatar: d.avatar || d.profilFoto || d.photoURL || "",
    bio: d.bio || "",
    website: d.website || d.web || "",
    reputation: d.reputation || { score: 0 },
    followersCount,
    followingCount,
    postsCount,
    highlights: Array.isArray(d.highlights) ? d.highlights : [],
    isSelf: !!d.isSelf,
  };
}
