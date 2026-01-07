// src/commentsClient.js
// Firestore tabanlı yorum okuma/ekleme yardımcıları (mobil IG davranışına yakın).
import { auth, db } from "./firebase";
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
} from "firebase/firestore";

const COMMENTS_PATH = (contentKey) => collection(db, "content", contentKey, "comments");
const CONTENT_DOC = (contentKey) => doc(db, "content", contentKey);

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

function toSafeNumber(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
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
export async function getComments({ contentId, targetType, targetId, pageSize = 25, cursor = null }) {
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
  const authorName = user?.displayName || (user?.email ? user.email.split("@")[0] : "kullanıcı");
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

// -------------------- EMİR 13: commentsCount doc-field watcher (+ 1x fallback) --------------------
const __countBlockedPaths = new Set(); // permission-denied aldıysa aynı session'da tekrar dinleme
const __countWatchers = new Map(); // path -> { callbacks:Set<fn>, last:number, unsub:fn|null, fallbackDone:boolean }

function getCountEntry(path) {
  return __countWatchers.get(path) || null;
}

async function runFallbackOnce({ key, entry, docPath }) {
  if (!entry || entry.fallbackDone) return;
  entry.fallbackDone = true;

  try {
    // 1 kere: collection size yerine count aggregation (maliyet düşük)
    const q = query(COMMENTS_PATH(key));
    const agg = await getCountFromServer(q);
    const n = toSafeNumber(agg?.data()?.count);
    entry.last = n;
    for (const cb of entry.callbacks) safeCall(cb, n);
  } catch (err) {
    const code = err?.code ? String(err.code) : "unknown";
    logPermDeniedOnce("comments:count:fallback", `content/${key}/comments`, err);

    // degrade: 0
    entry.last = 0;
    for (const cb of entry.callbacks) safeCall(cb, 0);

    if (code === "permission-denied") {
      __countBlockedPaths.add(docPath);
    }
  }
}

function ensureCountEntry(path, docRef, key) {
  const existing = getCountEntry(path);
  if (existing) return existing;

  const entry = {
    callbacks: new Set(),
    last: 0,
    unsub: null,
    fallbackDone: false,
  };

  entry.unsub = onSnapshot(
    docRef,
    (snap) => {
      // doc yoksa veya alan yoksa: 0 bas + 1 kere fallback dene
      if (!snap || !snap.exists()) {
        entry.last = 0;
        for (const cb of entry.callbacks) safeCall(cb, 0);
        runFallbackOnce({ key, entry, docPath: path });
        return;
      }

      const data = snap.data() || {};
      const raw = data.commentsCount;

      // alan yoksa: 0 + 1 kere fallback
      if (raw === undefined || raw === null) {
        entry.last = 0;
        for (const cb of entry.callbacks) safeCall(cb, 0);
        runFallbackOnce({ key, entry, docPath: path });
        return;
      }

      const v = toSafeNumber(raw);
      entry.last = v;
      for (const cb of entry.callbacks) safeCall(cb, v);
    },
    (err) => {
      const code = err?.code ? String(err.code) : "unknown";
      logPermDeniedOnce("comments:count:doc", path, err);

      // degrade: 0
      entry.last = 0;
      for (const cb of entry.callbacks) safeCall(cb, 0);

      // permission-denied → bu docPath için tekrar listener kurma (spam döngüsünü kır)
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
 * EMİR 13: Yorum sayısını gerçek zamanlı takip et (sekme etiketi için)
 * - Artık collection snapshot yok → content/{key} doc snapshot
 * - Field yoksa / doc yoksa: 1 kere count aggregation fallback (geriye uyumluluk)
 * - permission-denied spam kırıcı (session cache)
 */
export function watchCommentsCount({ contentId, targetType, targetId }, onChange) {
  if (typeof onChange !== "function") return () => {};

  let key;
  try {
    key = buildContentKey({ contentId, targetType, targetId });
  } catch {
    safeCall(onChange, 0);
    return () => {};
  }

  // ✅ logged-in değilse listener açma (rules: content read signed-in)
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    safeCall(onChange, 0);
    return () => {};
  }

  const docRef = CONTENT_DOC(key);
  const path = docRef?.path ? String(docRef.path) : `content/${key}`;

  // ✅ permission-denied gördüysek tekrar dinleme (session içinde)
  if (__countBlockedPaths.has(path)) {
    safeCall(onChange, 0);
    return () => {};
  }

  // ✅ tek listener: aynı path’e bağlananlar callback set’ine eklenir
  const entry = ensureCountEntry(path, docRef, key);
  entry.callbacks.add(onChange);

  // anlık last varsa hemen bas (pırıl pırıl)
  safeCall(onChange, entry.last);

  return () => detachCountCallback(path, onChange);
}
