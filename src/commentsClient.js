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

// EMİR 14: Tek standart — targetType/targetId varsa HER YERDE target öncelikli
function buildContentKey({ contentId, targetType, targetId }) {
  if (targetType && targetId) return `${targetType}:${targetId}`;
  if (contentId) return contentId;
  throw new Error("targetType/targetId veya contentId gerekli.");
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

// -------------------- EMİR 14: Optimistic rozet helpers --------------------
const OPTIMISTIC_TTL_MS = 6000;

function clampNonNeg(n) {
  const x = toSafeNumber(n);
  return x < 0 ? 0 : x;
}

function computeVisibleCount(entry) {
  const base = clampNonNeg(entry?.lastDoc);
  const pending = clampNonNeg(entry?.pending);
  return base + pending;
}

function clearPendingTimer(entry) {
  if (!entry?.pendingTimer) return;
  try {
    clearTimeout(entry.pendingTimer);
  } catch {
    // no-op
  }
  entry.pendingTimer = null;
}

function schedulePendingReset(entry) {
  if (!entry) return;
  clearPendingTimer(entry);
  entry.pendingTimer = setTimeout(() => {
    // watcher hâlâ yaşıyor olabilir; callbacks boşsa detach zaten entry’yi silecek
    entry.pending = 0;
    const v = computeVisibleCount(entry);
    entry.last = v;
    for (const cb of entry.callbacks) safeCall(cb, v);
    entry.pendingTimer = null;
  }, OPTIMISTIC_TTL_MS);
}

function bumpOptimisticCountByKey(key, delta) {
  if (!key || typeof key !== "string") return;

  const docRef = CONTENT_DOC(key);
  const path = docRef?.path ? String(docRef.path) : `content/${key}`;
  const entry = __countWatchers.get(path);
  if (!entry) return; // watcher yoksa optimistic yapma

  const d = toSafeNumber(delta);
  if (!d) return;

  entry.pending = clampNonNeg((entry.pending || 0) + d);
  entry.last = computeVisibleCount(entry);

  // anında bas
  for (const cb of entry.callbacks) safeCall(cb, entry.last);

  // TTL reset
  schedulePendingReset(entry);
}
// ---------------------------------------------------------------------------

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

  // ✅ EMİR 14: optimistic rozet (watcher varsa anında +1)
  bumpOptimisticCountByKey(key, +1);

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

// -------------------- EMİR 13 + EMİR 14: doc-field watcher (+ 1x fallback + optimistic pending) --------------------
const __countBlockedPaths = new Set(); // permission-denied aldıysa aynı session'da tekrar dinleme
// path -> {
//   callbacks:Set<fn>,
//   last:number,            // UI'ya basılan değer (lastDoc + pending)
//   unsub:fn|null,
//   fallbackDone:boolean,
//   lastDoc:number,         // doc'tan (veya fallback) gelen gerçek değer
//   pending:number,         // optimistic delta
//   pendingTimer:any|null,  // setTimeout id
// }
const __countWatchers = new Map();

async function runFallbackOnce({ key, entry, docPath }) {
  if (!entry || entry.fallbackDone) return;
  entry.fallbackDone = true;

  try {
    // 1 kere: collection count aggregation (geriye uyumluluk)
    const q = query(COMMENTS_PATH(key));
    const agg = await getCountFromServer(q);
    const n = clampNonNeg(agg?.data()?.count);

    entry.lastDoc = n;
    entry.last = computeVisibleCount(entry);
    for (const cb of entry.callbacks) safeCall(cb, entry.last);

    // pending varsa TTL garanti et
    if (entry.pending > 0) schedulePendingReset(entry);
  } catch (err) {
    const code = err?.code ? String(err.code) : "unknown";
    logPermDeniedOnce("comments:count:fallback", `content/${key}/comments`, err);

    // degrade: 0
    entry.lastDoc = 0;
    entry.last = computeVisibleCount(entry);
    for (const cb of entry.callbacks) safeCall(cb, entry.last);

    if (code === "permission-denied") {
      __countBlockedPaths.add(docPath);
    }
  }
}

function ensureCountEntry(path, docRef, key) {
  const existing = __countWatchers.get(path);
  if (existing) return existing;

  const entry = {
    callbacks: new Set(),
    last: 0,
    unsub: null,
    fallbackDone: false,

    // EMİR 14
    lastDoc: 0,
    pending: 0,
    pendingTimer: null,
  };

  entry.unsub = onSnapshot(
    docRef,
    (snap) => {
      // doc yoksa: 0 + 1 kere fallback
      if (!snap || !snap.exists()) {
        entry.lastDoc = 0;
        entry.last = computeVisibleCount(entry);
        for (const cb of entry.callbacks) safeCall(cb, entry.last);
        runFallbackOnce({ key, entry, docPath: path });

        if (entry.pending > 0) schedulePendingReset(entry);
        return;
      }

      const data = snap.data() || {};
      const raw = data.commentsCount;

      // field yoksa: mevcut lastDoc/last'ı bozma; 1 kere fallback dene
      if (raw === undefined || raw === null) {
        // ilk kezse 0 bas (tutarlı başlangıç)
        if (!entry.fallbackDone && entry.lastDoc === 0 && entry.last === 0) {
          entry.last = computeVisibleCount(entry);
          for (const cb of entry.callbacks) safeCall(cb, entry.last);
        }
        runFallbackOnce({ key, entry, docPath: path });
        if (entry.pending > 0) schedulePendingReset(entry);
        return;
      }

      const nextDoc = clampNonNeg(raw);
      const prevDoc = clampNonNeg(entry.lastDoc);
      const prevShown = clampNonNeg(entry.last);

      // doc güncellendi
      entry.lastDoc = nextDoc;

      // EMİR 14: pending'i “yetişme” durumuna göre azalt/sıfırla
      if (entry.pending > 0) {
        const inc = nextDoc - prevDoc;

        // Kısmi catch-up: doc artışı kadar pending düşür (overshoot’u engeller)
        if (inc > 0) {
          entry.pending = clampNonNeg(entry.pending - inc);
        }

        // Basit kural: doc, ekranda gösterdiğin değere yetiştiyse (veya geçtiyse) pending'i sıfırla
        const recomputedShown = nextDoc + entry.pending;
        if (nextDoc >= prevShown || nextDoc >= recomputedShown) {
          entry.pending = 0;
        }

        if (entry.pending === 0) {
          clearPendingTimer(entry);
        } else {
          schedulePendingReset(entry);
        }
      }

      entry.last = computeVisibleCount(entry);
      for (const cb of entry.callbacks) safeCall(cb, entry.last);
    },
    (err) => {
      const code = err?.code ? String(err.code) : "unknown";
      logPermDeniedOnce("comments:count:doc", path, err);

      // degrade: 0 (pending varsa onun kadar göstermek yerine 0+pending gösterelim: daha “dürüst”)
      entry.lastDoc = 0;
      entry.last = computeVisibleCount(entry);
      for (const cb of entry.callbacks) safeCall(cb, entry.last);

      if (entry.pending > 0) schedulePendingReset(entry);

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
  const entry = __countWatchers.get(path);
  if (!entry) return;

  entry.callbacks.delete(cb);

  // kimse kalmadıysa listener'ı kapat + timer temizle
  if (entry.callbacks.size === 0) {
    clearPendingTimer(entry);
    try {
      entry.unsub?.();
    } catch {
      // no-op
    }
    __countWatchers.delete(path);
  }
}

/**
 * EMİR 13 + EMİR 14: Yorum sayısını gerçek zamanlı takip et (sekme etiketi için)
 * - content/{key} doc snapshot (commentsCount)
 * - Field/doc yoksa: 1 kere count aggregation fallback (geriye uyumluluk)
 * - Tek listener cache + permission-denied spam kırıcı
 * - addComment sonrası watcher varsa optimistic +1, 6sn TTL drift reset
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
