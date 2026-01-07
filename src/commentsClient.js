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

// -------------------- EMİR 09: permission-denied dedupe logger --------------------
const __DEV__ = process.env.NODE_ENV !== "production";
const __permDeniedSeen = new Set();

function logPermDeniedOnce(label, path, err) {
  if (!__DEV__) return;
  const code = err?.code ? String(err.code) : "unknown";
  const message = err?.message ? String(err.message) : "";
  const key = `${label}|${path}|${code}`;
  if (__permDeniedSeen.has(key)) return;
  __permDeniedSeen.add(key);

  // eslint-disable-next-line no-console
  console.warn("[perm-denied]", { label, path, code, message });
}
// -------------------------------------------------------------------------------

// ADIM 31: Farklı hedef tipleri için tekil contentKey üretimi
function buildContentKey({ contentId, targetType, targetId }) {
  if (contentId) return contentId;
  if (targetType && targetId) return `${targetType}:${targetId}`;
  throw new Error("contentId veya targetType/targetId gerekli.");
}

function safeCall(cb, value) {
  try {
    cb?.(value);
  } catch {
    // no-op
  }
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

// -------------------- EMİR 11: comments:count fail-graceful + tek listener/cache --------------------
const __countBlockedPaths = new Set(); // permission-denied aldıysa aynı session'da tekrar dinleme
const __countWatchers = new Map(); // path -> { callbacks:Set<fn>, last:number, unsub:fn|null }

function getCountEntry(path) {
  return __countWatchers.get(path) || null;
}

function ensureCountEntry(path, colRef) {
  const existing = getCountEntry(path);
  if (existing) return existing;

  const entry = {
    callbacks: new Set(),
    last: 0,
    unsub: null,
  };

  entry.unsub = onSnapshot(
    colRef,
    (snap) => {
      const size = snap && typeof snap.size === "number" ? snap.size : 0;
      entry.last = size;
      for (const cb of entry.callbacks) safeCall(cb, size);
    },
    (err) => {
      const code = err?.code ? String(err.code) : "unknown";
      logPermDeniedOnce("comments:count", path, err);

      // degrade: count yokmuş gibi davran
      entry.last = 0;
      for (const cb of entry.callbacks) safeCall(cb, 0);

      // permission-denied → bu path için tekrar listener kurma (spam döngüsünü kır)
      if (code === "permission-denied") {
        __countBlockedPaths.add(path);
        try {
          entry.unsub?.();
        } catch {
          // no-op
        }
        entry.unsub = null;
      }
    }
  );

  __countWatchers.set(path, entry);
  return entry;
}

function detachCountCallback(path, cb) {
  const entry = getCountEntry(path);
  if (!entry) return;

  entry.callbacks.delete(cb);

  // kimse kalmadıysa listener'ı kapat
  if (entry.callbacks.size === 0) {
    try {
      entry.unsub?.();
    } catch {
      // no-op
    }
    __countWatchers.delete(path);
  }
}

/**
 * ADIM 31: Yorum sayısını gerçek zamanlı takip et (sekme etiketi için)
 * - EMİR 11: error callback asla uncaught değil
 * - logged-in değilse listener açma
 * - aynı contentKey için tek listener (cache)
 * - permission-denied aldıysa aynı session’da tekrar deneme (spam fix)
 */
export function watchCommentsCount(
  { contentId, targetType, targetId },
  onChange
) {
  if (typeof onChange !== "function") return () => {};

  let key;
  try {
    key = buildContentKey({ contentId, targetType, targetId });
  } catch {
    safeCall(onChange, 0);
    return () => {};
  }

  // ✅ logged-in değilse listener açma
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    safeCall(onChange, 0);
    return () => {};
  }

  const colRef = COMMENTS_PATH(key);
  const path = colRef?.path ? String(colRef.path) : `content/${key}/comments`;

  // ✅ permission-denied gördüysek tekrar dinleme (session içinde)
  if (__countBlockedPaths.has(path)) {
    safeCall(onChange, 0);
    return () => {};
  }

  // ✅ tek listener: aynı path’e bağlananlar callback set’ine eklenir
  const entry = ensureCountEntry(path, colRef);
  entry.callbacks.add(onChange);

  // anlık last varsa hemen bas (pırıl pırıl)
  safeCall(onChange, entry.last);

  return () => detachCountCallback(path, onChange);
}
