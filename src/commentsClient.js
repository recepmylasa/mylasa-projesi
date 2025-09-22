// src/commentsClient.js
// Firestore tabanlı yorum okuma/ekleme yardımcıları (mobil IG davranışına yakın).
import { auth, db } from "./firebase";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
} from "firebase/firestore";

const COMMENTS_PATH = (contentId) => collection(db, "content", contentId, "comments");

/**
 * Yorumları getir (sayfalı)
 * @param {object} args
 * @param {string} args.contentId
 * @param {number} [args.pageSize=25]
 * @param {*} [args.cursor] Firestore lastDoc
 */
export async function getComments({ contentId, pageSize = 25, cursor = null }) {
  if (!contentId) return { items: [], nextCursor: null };

  const parts = [orderBy("createdAt", "desc"), limit(pageSize)];
  if (cursor) parts.push(startAfter(cursor));

  const q = query(COMMENTS_PATH(contentId), ...parts);
  const snap = await getDocs(q);

  const docs = snap.docs;
  const items = docs.map((d) => {
    const x = d.data() || {};
    return {
      id: d.id,
      text: x.text || "",
      authorId: x.authorId || "",
      authorName: x.authorName || "kullanıcı",
      authorPhoto: x.authorPhoto || "",
      createdAt: x.createdAt || null,
    };
  });

  const nextCursor = docs.length === pageSize ? docs[docs.length - 1] : null;
  return { items, nextCursor };
}

/**
 * Yorum ekle (auth zorunlu)
 * @param {object} args
 * @param {string} args.contentId
 * @param {string} args.text
 */
export async function addComment({ contentId, text }) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Oturum açmalısın.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Yorum boş olamaz.");
  if (!contentId) throw new Error("contentId gerekli.");

  const user = auth.currentUser;
  const authorName =
    user?.displayName ||
    (user?.email ? user.email.split("@")[0] : "kullanıcı");
  const authorPhoto = user?.photoURL || "";

  const ref = await addDoc(COMMENTS_PATH(contentId), {
    text: clean,
    authorId: uid,
    authorName,
    authorPhoto,
    createdAt: serverTimestamp(),
  });

  // Optimistic UI için yerel obje döndür (serverTimestamp henüz gelmedi)
  return {
    id: ref.id,
    text: clean,
    authorId: uid,
    authorName,
    authorPhoto,
    createdAt: new Date(),
  };
}
