// src/reputationClient.js
// Oy verme: /content/<id>/ratings/<uid>
// Not: Kök /content belgesini rater güncellemez. (Kurallara göre sadece author update edebilir.)

import { auth, db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";

export const CONTENT_COL = "content";
export const RATINGS_SUBCOL = "ratings";

/** İçerik belgesini sadece yoksa oluştur. (update yok!) */
export async function ensureContentDoc(contentId, authorId = "unknown", type = "post") {
  if (!contentId) throw new Error("ensureContentDoc: contentId gerekli.");
  const ref = doc(db, CONTENT_COL, String(contentId));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // kurallar: create serbest (authorId string, type in ['post','story','clip'])
    await setDoc(ref, {
      authorId: String(authorId),
      type: String(type),
      createdAt: serverTimestamp(),
    });
  }
  return ref;
}

/**
 * Oy ver (yalnızca /ratings altına yazar)
 * @param {{contentId:string, authorId?:string, value:number, type?:'post'|'story'|'clip'}} p
 */
export async function rateContent({ contentId, authorId = "unknown", value, type = "post" }) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated.");
  if (!contentId) throw new Error("contentId required.");
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error("value 1..5 olmalı.");

  await ensureContentDoc(contentId, authorId, type);

  const ratingRef = doc(db, CONTENT_COL, String(contentId), RATINGS_SUBCOL, uid);
  await setDoc(
    ratingRef,
    {
      raterId: uid,
      value,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(), // merge yazacağımız için ilkinde dolacak
    },
    { merge: true }
  );

  return { ok: true };
}

/** İçerik aggregate canlı dinleme (UI eskisiyle uyumlu: agg.*) */
export function onContentAggregate(contentId, cb) {
  if (!contentId) return () => {};
  const ref = doc(db, CONTENT_COL, String(contentId));
  return onSnapshot(ref, (snap) => cb(snap.exists() ? (snap.data()?.agg || null) : null));
}
