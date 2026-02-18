// FILE: src/commentsClient.js
// Firestore tabanlı yorum okuma/ekleme yardımcıları (mobil IG davranışına yakın).
import { auth, db } from "./firebase";
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
} from "firebase/firestore";
import { onAuthStateChanged as onAuthStateChangedMod } from "firebase/auth";
import { safeOnSnapshot } from "./utils/safeSnapshot";

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

function isPermDenied(err) {
  try {
    const code = String(err?.code || "").toLowerCase();
    const msg = String(err?.message || "").toLowerCase();
    const t = `${code} ${msg}`;
    return t.includes("permission") && t.includes("denied");
  } catch {
    return false;
  }
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

  for (const cb of entry.callbacks) safeCall(cb, entry.last);
  schedulePendingReset(entry);
}
// ---------------------------------------------------------------------------

/**
 * ✅ getComments asla "uncaught" bırakmasın:
 * - permission-denied vb. hatalarda boş döner.
 */
export async function getComments({ contentId, targetType, targetId, pageSize = 25, cursor = null }) {
  let key;
  try {
    key = buildContentKey({ contentId, targetType, targetId });
  } catch {
    return { items: [], nextCursor: null };
  }

  const size = Math.max(1, Math.min(50, Number(pageSize) || 25));

  try {
    const parts = [orderBy("createdAt", "desc"), limit(size)];
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

    const nextCursor = docs.length === size ? docs[docs.length - 1] : null;
    return { items, nextCursor };
  } catch (err) {
    if (isPermDenied(err)) {
      logPermDeniedOnce("comments:get", `content/${key}/comments`, err);
      return { items: [], nextCursor: null };
    }
    // diğer hatalarda da UI’yi düşürmeyelim
    return { items: [], nextCursor: null };
  }
}

export async function addComment({ contentId, targetType, targetId, text }) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Oturum açmalısın.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Yorum boş olamaz.");

  const key = buildContentKey({ contentId, targetType, targetId });

  const user = auth.currentUser;
  const authorName = user?.displayName || (user?.email ? user.email.split("@")[0] : "kullanıcı");
  const authorPhoto = user?.photoURL || "";

  try {
    const ref = await addDoc(COMMENTS_PATH(key), {
      text: clean,
      authorId: uid,
      authorName,
      authorPhoto,
      createdAt: serverTimestamp(),
    });

    // ✅ EMİR 14: optimistic rozet (watcher varsa anında +1)
    bumpOptimisticCountByKey(key, +1);

    return {
      id: ref.id,
      text: clean,
      authorId: uid,
      authorName,
      authorPhoto,
      createdAt: new Date(),
    };
  } catch (err) {
    if (isPermDenied(err)) {
      throw new Error("Yorum eklemek için yetkin yok (permission-denied).");
    }
    throw err;
  }
}

// -------------------- EMİR 13 + EMİR 14: doc-field watcher (+ 1x fallback + optimistic pending) --------------------
const __countBlockedPaths = new Set(); // permission-denied aldıysa aynı session'da tekrar dinleme
const __countWatchers = new Map();

/**
 * ✅ Auth değişince:
 * - daha önce permission-denied sebebiyle bloklanan path’leri temizle
 * - böylece login/logout sonrası sayaç yeniden denenebilir
 */
let __authResetInited = false;
function initAuthBlockedReset() {
  if (__authResetInited) return;
  __authResetInited = true;

  const reset = () => {
    try {
      __countBlockedPaths.clear();
    } catch {}
  };

  try {
    if (auth && typeof auth.onAuthStateChanged === "function") {
      auth.onAuthStateChanged(() => reset());
      return;
    }
  } catch {
    // no-op
  }

  try {
    onAuthStateChangedMod(auth, () => reset());
  } catch {
    // no-op
  }
}
initAuthBlockedReset();

async function runFallbackOnce({ key, entry, docPath }) {
  if (!entry || entry.fallbackDone) return;
  entry.fallbackDone = true;

  try {
    const q = query(COMMENTS_PATH(key));
    const agg = await getCountFromServer(q);
    const n = clampNonNeg(agg?.data()?.count);

    entry.lastDoc = n;
    entry.last = computeVisibleCount(entry);
    for (const cb of entry.callbacks) safeCall(cb, entry.last);

    if (entry.pending > 0) schedulePendingReset(entry);
  } catch (err) {
    const code = err?.code ? String(err.code) : "unknown";
    logPermDeniedOnce("comments:count:fallback", `content/${key}/comments`, err);

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
    lastDoc: 0,
    pending: 0,
    pendingTimer: null,
  };

  entry.unsub = safeOnSnapshot(
    docRef,
    (snap) => {
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

      if (raw === undefined || raw === null) {
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

      entry.lastDoc = nextDoc;

      if (entry.pending > 0) {
        const inc = nextDoc - prevDoc;

        if (inc > 0) {
          entry.pending = clampNonNeg(entry.pending - inc);
        }

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

      entry.lastDoc = 0;
      entry.last = computeVisibleCount(entry);
      for (const cb of entry.callbacks) safeCall(cb, entry.last);

      if (entry.pending > 0) schedulePendingReset(entry);

      if (code === "permission-denied") {
        __countBlockedPaths.add(path);
        try {
          entry.unsub?.();
        } catch {
          // no-op
        }
        entry.unsub = null;
      }
    },
    {
      label: "comments:count:doc",
      path,
      autoUnsubscribeOnPermissionDenied: true,
    }
  );

  __countWatchers.set(path, entry);
  return entry;
}

function detachCountCallback(path, cb) {
  const entry = __countWatchers.get(path);
  if (!entry) return;

  entry.callbacks.delete(cb);

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

export function watchCommentsCount({ contentId, targetType, targetId }, onChange) {
  if (typeof onChange !== "function") return () => {};

  let key;
  try {
    key = buildContentKey({ contentId, targetType, targetId });
  } catch {
    safeCall(onChange, 0);
    return () => {};
  }

  const uid = auth?.currentUser?.uid;
  if (!uid) {
    safeCall(onChange, 0);
    return () => {};
  }

  const docRef = CONTENT_DOC(key);
  const path = docRef?.path ? String(docRef.path) : `content/${key}`;

  if (__countBlockedPaths.has(path)) {
    safeCall(onChange, 0);
    return () => {};
  }

  const entry = ensureCountEntry(path, docRef, key);
  entry.callbacks.add(onChange);

  safeCall(onChange, entry.last);

  return () => detachCountCallback(path, onChange);
}
