// -------------------------------------------------------------
// Mylasa • Reputation Engine (İstemci Yardımcıları)
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

// === Koleksiyon/Saha adları ===
export const CONTENT_COL = "content";
export const RATINGS_SUBCOL = "ratings";
export const COMMENTS_SUBCOL = "comments"; // ✨ YENİ: yorum alt koleksiyonu
export const USERS_COL = "users";
export const USERSTATS_COL = "userStats";

// === Ayarlar ===
export const GOLD_VISIBLE_MIN = 4.5;
export const GOLD_SAMPLE_MIN = 1000;

// -------------------------------------------------------------
function currentUidOrThrow() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Auth yok: oturum açmış kullanıcı bulunamadı.");
  return uid;
}

export function isValidStar(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

// İçerik dokümanını (yoksa) oluştur
export async function ensureContentDoc(contentId, authorId, type = "post", extra = {}) {
  if (!contentId || !authorId) throw new Error("ensureContentDoc: contentId ve authorId zorunlu.");
  const ref = doc(db, CONTENT_COL, contentId);
  const snap = await getDoc(ref);
  if (snap.exists()) return ref;

  await setDoc(ref, {
    authorId,
    type, // 'post' | 'story' | 'clip'
    createdAt: serverTimestamp(),
    ...extra,
    agg: {
      count: 0,
      sum: 0,
      byStar: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
      bayes: 3.5,
      weight: 0.0,
      lastUpdated: serverTimestamp(),
    },
  }, { merge: true });

  return ref;
}

// Oy ver / güncelle (tek oy/kişi/içerik)
export async function rateContent({
  contentId,
  authorId,
  value,
  type = "post",
  extra = {},
}) {
  const raterId = currentUidOrThrow();
  if (!contentId || !authorId) throw new Error("rateContent: contentId ve authorId zorunlu.");
  if (!isValidStar(value)) throw new Error("Oy 1..5 arasında tam sayı olmalı.");

  await ensureContentDoc(contentId, authorId, type, extra);

  const ratingRef = doc(db, CONTENT_COL, contentId, RATINGS_SUBCOL, raterId);
  await setDoc(ratingRef, {
    raterId,
    authorId,
    value,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return { ok: true };
}

// ✨ YENİ — Bir yoruma oy ver / güncelle (tek oy/kişi/yorum)
export async function rateComment({ contentId, commentId, value }) {
  const raterId = currentUidOrThrow();
  if (!contentId || !commentId) throw new Error("rateComment: contentId ve commentId zorunlu.");
  if (!isValidStar(value)) throw new Error("Oy 1..5 arasında tam sayı olmalı.");

  const ratingRef = doc(
    db,
    CONTENT_COL,
    contentId,
    COMMENTS_SUBCOL,
    commentId,
    RATINGS_SUBCOL,
    raterId
  );

  await setDoc(
    ratingRef,
    {
      raterId,
      value,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
}

// ✨ YENİ — Yorumun agregesini (avg,count) canlı izle
export function onCommentAggregate(contentId, commentId, cb) {
  const ref = doc(db, CONTENT_COL, contentId, COMMENTS_SUBCOL, commentId);
  return onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    cb(data?.agg || null);
  });
}

// (Opsiyon) deterministik commentId üretici — eski kayıtlarda ID yoksa UI kullanabilir
export function deriveCommentId(yorum, index = 0) {
  return (
    yorum?.commentId ||
    (yorum?.userId && yorum?.timestamp
      ? `${yorum.userId}_${Date.parse(yorum.timestamp || 0) || 0}`
      : null) ||
    `idx_${index}`
  );
}

// Kullanıcı itibarını getir
export async function getUserReputation(uid) {
  const ref = doc(db, USERS_COL, uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;
  return data?.reputation || null;
}

// Kullanıcı itibarını canlı izle
export function onUserReputation(uid, cb) {
  const ref = doc(db, USERS_COL, uid);
  return onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : null;
    cb(data?.reputation || null, data?.badges || null);
  });
}

// İçerik agregesini getir
export async function getContentAggregate(contentId) {
  const ref = doc(db, CONTENT_COL, contentId);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;
  return data?.agg || null;
}

// İçerik agregesini canlı izle
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

// Altın rozet görünürlüğü
export function resolveGoldBadge(reputation, badges) {
  const visible = Number(reputation?.visible || 0);
  const sample = Number(reputation?.sample || 0);
  const rule = (visible >= GOLD_VISIBLE_MIN) && (sample >= GOLD_SAMPLE_MIN);
  const serverBadge = !!badges?.gold;
  return {
    shouldShow: rule && serverBadge,
    since: badges?.since || null,
    threshold: { visible: GOLD_VISIBLE_MIN, sample: GOLD_SAMPLE_MIN },
  };
}
