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
  onSnapshot,
} from "firebase/firestore";

const COMMENTS_PATH = (contentKey) =>
  collection(db, "content", contentKey, "comments");

// ADIM 31: Farklı hedef tipleri için tekil contentKey üretimi
function buildContentKey({ contentId, targetType, targetId }) {
  if (contentId) return contentId;
  if (targetType && targetId) return `${targetType}:${targetId}`;
  throw new Error("contentId veya targetType/targetId gerekli.");
}

/**
 * Yorumları getir (sayfalı)
 * @param {object} args
 * @param {string} [args.contentId]
 * @param {string} [args.targetType]
 * @param {string} [args.targetId]
 * @param {number} [args.pageSize=25]
 * @param {*} [args.cursor] Firestore lastDoc
 */
export async function getComments({
  contentId,
  targetType,
  targetId,
  pageSize = 25,
  cursor = null,
}) {
  let key;
  try {
    key = buildContentKey({ contentId, targetType, targetId });
  } catch {
    return { items: [], nextCursor: null };
  }

  const parts = [orderBy("createdAt", "desc"), limit(pageSize)];
  if (cursor) parts.push(startAfter(cursor));

  const q = query(COMMENTS_PATH(key), ...parts);
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
 * @param {string} [args.contentId]
 * @param {string} [args.targetType]
 * @param {string} [args.targetId]
 * @param {string} args.text
 */
export async function addComment({ contentId, targetType, targetId, text }) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Oturum açmalısın.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Yorum boş olamaz.");

  const key = buildContentKey({ contentId, targetType, targetId });

  const user = auth.currentUser;
  const authorName =
    user?.displayName ||
    (user?.email ? user.email.split("@")[0] : "kullanıcı");
  const authorPhoto = user?.photoURL || "";

  const ref = await addDoc(COMMENTS_PATH(key), {
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

// ADIM 31: Yorum sayısını gerçek zamanlı takip et (sekme etiketi için)
export function watchCommentsCount(
  { contentId, targetType, targetId },
  onChange
) {
  let key;
  try {
    key = buildContentKey({ contentId, targetType, targetId });
  } catch {
    return () => {};
  }
  if (typeof onChange !== "function") return () => {};

  const colRef = COMMENTS_PATH(key);
  const unsubscribe = onSnapshot(
    colRef,
    (snap) => {
      try {
        const size =
          snap && typeof snap.size === "number" ? snap.size : 0;
        onChange(size);
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[comments:count] callback hatası:", e);
        }
      }
    },
    (err) => {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[comments:count] izleme hatası:", err);
      }
      try {
        onChange(0);
      } catch {}
    }
  );

  return unsubscribe;
}
