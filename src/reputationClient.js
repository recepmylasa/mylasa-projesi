// Mylasa • Reputation Client (Frontend)
// - Oy verme (content/{id}/ratings/{uid})
// - Oy sonrası yıldız artır (incrementStars callable)
// - Kullanıcı/İçerik aggregate dinleyicileri

import { auth, db, functions } from "./firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, onSnapshot
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export const CONTENT_COL   = "content";
export const RATINGS_SUBCOL= "ratings";
export const COMMENTS_SUBCOL = "comments";
export const USERS_COL     = "users";
export const USERSTATS_COL = "userStats";

export const GOLD_VISIBLE_MIN = 4.5;
export const GOLD_SAMPLE_MIN  = 1000;

function currentUidOrThrow() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Oturum yok.");
  return uid;
}

export function isValidStar(v){ return Number.isInteger(v) && v>=1 && v<=5; }

export async function ensureContentDoc(contentId, authorId, type="post", extra={}) {
  if (!contentId || !authorId) throw new Error("ensureContentDoc: contentId/authorId zorunlu.");
  const ref = doc(db, CONTENT_COL, contentId);
  const snap = await getDoc(ref);
  if (snap.exists()) return ref;
  await setDoc(ref, {
    authorId, type, createdAt: serverTimestamp(),
    agg: { count:0, sum:0, byStar:{"1":0,"2":0,"3":0,"4":0,"5":0}, bayes:3.5, weight:0, lastUpdated: serverTimestamp() },
    ...extra
  }, { merge: true });
  return ref;
}

export async function rateContent({ contentId, authorId, value, type="post", extra={} }) {
  const raterId = currentUidOrThrow();
  if (!contentId || !authorId) throw new Error("rateContent: contentId/authorId zorunlu.");
  if (!isValidStar(value)) throw new Error("Oy 1..5 arasında tam sayı olmalı.");

  await ensureContentDoc(contentId, authorId, type, extra);

  const ratingRef = doc(db, CONTENT_COL, contentId, RATINGS_SUBCOL, raterId);
  await setDoc(ratingRef, {
    raterId, authorId, value,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // ⭐ Oy sonrası yıldız sayaçlarını artır (Labubu döngüsü)
  try {
    const inc = httpsCallable(functions, "incrementStars");
    await inc({});
  } catch (e) {
    // Konsola yaz ama UI’yı bloklama
    console.warn("incrementStars çağrısı başarısız:", e);
  }

  return { ok: true };
}

// İçerik aggregate canlı dinleme (eksik export hatasını çözer)
export function onContentAggregate(contentId, cb) {
  const ref = doc(db, CONTENT_COL, contentId);
  return onSnapshot(ref, (snap) => cb(snap.exists() ? (snap.data()?.agg || null) : null));
}

// Kullanıcı itibar dinleyicisi
export function onUserReputation(uid, cb) {
  const ref = doc(db, USERS_COL, uid);
  return onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    cb(data?.reputation || null, data?.badges || null);
  });
}

// Kullanıcı itibarını tek seferlik getir
export async function getUserReputation(uid) {
  const ref = doc(db, USERS_COL, uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;
  return data?.reputation || null;
}
