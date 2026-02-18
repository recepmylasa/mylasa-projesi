// FILE: src/utils/safeSnapshot.js
import { onSnapshot } from "firebase/firestore";

const __DEV__ = process.env.NODE_ENV !== "production";
const __seen = new Set();

function isPermissionDenied(err) {
  const code = err?.code ? String(err.code) : "";
  if (code === "permission-denied") return true;

  const msg = err?.message ? String(err.message).toLowerCase() : "";
  if (msg.includes("permission-denied")) return true;
  if (msg.includes("missing or insufficient permissions")) return true;

  return false;
}

function debugOnce(key, ...args) {
  if (!__DEV__) return;
  let enabled = false;
  try {
    enabled = typeof window !== "undefined" && window.localStorage.getItem("FS_DEBUG") === "1";
  } catch {}
  if (!enabled) return;

  if (__seen.has(key)) return;
  __seen.add(key);

  try {
    // eslint-disable-next-line no-console
    console.debug(...args);
  } catch {}
}

/**
 * Safe wrapper for Firestore onSnapshot:
 * - onNext try/catch (prevents "@firebase/firestore ... Uncaught Error in snapshot listener")
 * - onError always wrapped (never throws)
 * - optionally auto-unsub on permission-denied
 */
export function safeOnSnapshot(refOrQuery, onNext, onError, meta = {}) {
  const {
    label = "snapshot",
    path = "",
    onPermissionDenied = null,
    autoUnsubscribeOnPermissionDenied = true,
    snapshotOptions = undefined, // e.g. { includeMetadataChanges: true }
  } = meta || {};

  const safePath =
    path ||
    (() => {
      try {
        const p = refOrQuery?.path;
        return p ? String(p) : "";
      } catch {
        return "";
      }
    })();

  let unsub = () => {};

  const safeNext = (snap) => {
    try {
      onNext?.(snap);
    } catch (e) {
      debugOnce(
        `NEXT_THROW|${label}|${safePath}`,
        `[safeOnSnapshot] onNext throw (${label})`,
        { path: safePath, error: e }
      );
      // swallow
    }
  };

  const safeErr = (err) => {
    try {
      onError?.(err);
    } catch (e) {
      debugOnce(
        `ERR_THROW|${label}|${safePath}`,
        `[safeOnSnapshot] onError throw (${label})`,
        { path: safePath, error: e }
      );
      // swallow
    }

    if (isPermissionDenied(err)) {
      try {
        onPermissionDenied?.(err);
      } catch {
        // swallow
      }

      if (autoUnsubscribeOnPermissionDenied) {
        try {
          unsub?.();
        } catch {
          // swallow
        }
      }
    }

    debugOnce(
      `ERR|${label}|${safePath}|${String(err?.code || "")}`,
      `[safeOnSnapshot] error (${label})`,
      { path: safePath, code: err?.code, message: err?.message }
    );
  };

  unsub = snapshotOptions
    ? onSnapshot(refOrQuery, snapshotOptions, safeNext, safeErr)
    : onSnapshot(refOrQuery, safeNext, safeErr);

  return unsub;
}
