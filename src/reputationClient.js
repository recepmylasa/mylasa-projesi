// src/reputationClient.js
// -------------------------------------------------------------
// Mylasa • Reputation Engine (İstemci Yardımcıları)
// - Beğeni yok; içerik başına 1–5 yıldız oylama
// - Firestore şeması: content/{contentId} + ratings alt koleksiyonu
// - Cloud Functions: onRatingWrite (agg + userStats), recomputeUserReputation
// -------------------------------------------------------------

import { auth, db, functions } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// === Koleksiyon/Saha adları (Functions ile uyumlu) ===
export const CONTENT_COL = "content";           // content/{contentId}
export const RATINGS_SUBCOL = "ratings";        // content/{id}/ratings/{raterId}
export const USERS_COL = "users";               // users/{uid}
export const USERSTATS_COL = "userStats";       // userStats/{uid}

// === Ayarlar (UI’da da kullanılabilir) ===
export const GOLD_VISIBLE_MIN = 4.5;
export const GOLD_SAMPLE_MIN = 1000;

// -------------------------------------------------------------
// Yardımcılar
// -------------------------------------------------------------
function currentUidOrThrow() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Auth yok: oturum açmış kullanıcı bulunamadı.");
  return uid;
}

export function isValidStar(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

// İçerik dokümanını (yoksa) oluşturur: agg alanlarıyla sıfırdan
export async function ensureContentDoc(contentId, authorId, type = "post", extra = {}) {
  if (!contentId || !authorId) throw new Error("ensureContentDoc: contentId ve authorId zorunlu.");
  const ref = doc(db, CONTENT_COL, contentId);
  const snap = await getDoc(ref);
  if (snap.exists()) return ref;

  // Functions beklentisiyle %100 uyumlu başlangıç şeması
  await setDoc(ref, {
    authorId,
    type, // 'post' | 'story' | 'clip'
    createdAt: serverTimestamp(),
    ...extra,
    agg: {
      count: 0,
      sum: 0,
      byStar: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
      bayes: 3.5,     // başlangıç ortalaması (μ)
      weight: 0.0,    // log(1 + count)
      lastUpdated: serverTimestamp(),
    },
  }, { merge: true });

  return ref;
}

// İçeriğe oy verme: docId = raterId (tek oy/kişi/içerik)
// - Eğer content/{id} yoksa oluşturulmasına yardım eder (owner/type paramlarıyla).
export async function rateContent({
  contentId,
  authorId,
  value,
  type = "post",     // 'post' | 'story' | 'clip' (UI çağırırken düzgün gönder)
  extra = {},        // içerik ilk oluşurken ek metadata gerekiyorsa
}) {
  const raterId = currentUidOrThrow();
  if (!contentId || !authorId) throw new Error("rateContent: contentId ve authorId zorunlu.");
  if (raterId === authorId) throw new Error("Kendi içeriğine oy veremezsin.");
  if (!isValidStar(value)) throw new Error("Oy 1..5 arasında tam sayı olmalı.");

  // İçerik dokümanını garanti altına al
  await ensureContentDoc(contentId, authorId, type, extra);

  // Oy dokümanını yaz (create/update aynı dokümana gider)
  const ratingRef = doc(db, CONTENT_COL, contentId, RATINGS_SUBCOL, raterId);
  await setDoc(ratingRef, {
    raterId,
    authorId,    // içerik sahibi
    value,       // 1..5
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Not: Functions tarafındaki onRatingWrite tetiklenir → agg + userStats güncellenir.
  return { ok: true };
}

// Kullanıcı itibarını (users/{uid}.reputation) tek seferde getir
export async function getUserReputation(uid) {
  const ref = doc(db, USERS_COL, uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;
  return data?.reputation || null;
}

// Kullanıcı itibarını canlı izle (unsubscribe döner)
export function onUserReputation(uid, cb) {
  const ref = doc(db, USERS_COL, uid);
  return onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    cb(data?.reputation || null, data?.badges || null);
  });
}

// İçerik agregesini tek seferde getir
export async function getContentAggregate(contentId) {
  const ref = doc(db, CONTENT_COL, contentId);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;
  return data?.agg || null;
}

// İçerik agregesini canlı izle (unsubscribe döner)
export function onContentAggregate(contentId, cb) {
  const ref = doc(db, CONTENT_COL, contentId);
  return onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    cb(data?.agg || null);
  });
}

// Cloud Function: reputasyonu elle hesaplat (opsiyonel)
export async function recomputeUserReputation(uid) {
  const callable = httpsCallable(functions, "recomputeUserReputation");
  const res = await callable({ uid });
  return res?.data || { ok: false };
}

// Altın rozet görünürlüğünü UI için sadeleştir
export function resolveGoldBadge(reputation, badges) {
  const visible = Number(reputation?.visible || 0);
  const sample = Number(reputation?.sample || 0);
  const rule = (visible >= GOLD_VISIBLE_MIN) && (sample >= GOLD_SAMPLE_MIN);
  const serverBadge = !!badges?.gold;
  return {
    shouldShow: rule && serverBadge, // hem kural hem sunucu "gold: true"
    since: badges?.since || null,
    threshold: { visible: GOLD_VISIBLE_MIN, sample: GOLD_SAMPLE_MIN },
  };
}
