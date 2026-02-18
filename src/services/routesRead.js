// FILE: src/services/routesRead.js
// Rota okuma servisleri (yalnızca READ). Hata toleranslı.

import { db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit as qLimit,
  getDocs,
} from "firebase/firestore";

import { safeOnSnapshot } from "../utils/safeSnapshot";

const __DEV__ = process.env.NODE_ENV !== "production";
const __snapErrSeen = new Set();

function logSnapErrOnce(label, path, err) {
  if (!__DEV__) return;
  const code = err?.code ? String(err.code) : "unknown";
  const msg = err?.message ? String(err.message) : "";
  const key = `${label}|${path}|${code}`;
  if (__snapErrSeen.has(key)) return;
  __snapErrSeen.add(key);
  // eslint-disable-next-line no-console
  console.warn("[snapshot-error]", { label, path, code, msg });
}

// Tek rota oku
export async function getRoute(routeId) {
  try {
    const ref = doc(db, "routes", String(routeId || ""));
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch {
    return null;
  }
}

// Rota canlı izle (unsubscribe döner)
// ✅ opts: { label?: string, onError?: (err)=>void }
export function watchRoute(routeId, cb, opts = {}) {
  const rid = String(routeId || "").trim();
  if (!rid) return () => {};

  const ref = doc(db, "routes", rid);
  const path = ref?.path ? String(ref.path) : `routes/${rid}`;

  const label = opts?.label ? String(opts.label) : "watchRoute";
  const onError =
    typeof opts?.onError === "function" ? opts.onError : null;

  try {
    const unsub = safeOnSnapshot(
      ref,
      (snap) => {
        try {
          if (!snap || !snap.exists()) return cb?.(null);
          cb?.({ id: snap.id, ...snap.data() });
        } catch {
          // swallow
        }
      },
      (err) => {
        logSnapErrOnce(label, path, err);

        // hook tarafındaki permission-degrade mekanizmasını tetikle
        try {
          onError?.(err);
        } catch {}

        // UI en azından boş düşsün
        try {
          cb?.(null);
        } catch {}
      },
      {
        label,
        path,
        autoUnsubscribeOnPermissionDenied: true,
      }
    );

    return unsub;
  } catch {
    return () => {};
  }
}

// Bitmiş rotaları listele (sahip bazlı)
export async function listUserRoutes(userId, { limit = 20 } = {}) {
  try {
    const col = collection(db, "routes");
    const q = query(
      col,
      where("ownerId", "==", String(userId || "")),
      where("status", "==", "finished"),
      orderBy("createdAt", "desc"),
      qLimit(Math.max(1, Math.min(50, limit)))
    );
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    return out;
  } catch {
    return [];
  }
}

// Durakları bir kerelik al
export async function listStops(routeId) {
  try {
    const col = collection(db, "routes", String(routeId || ""), "stops");
    const q = query(col, orderBy("order", "asc"));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    return out;
  } catch {
    return [];
  }
}

// Durakları canlı izle
// ✅ opts: { label?: string, onError?: (err)=>void }
export function watchStops(routeId, cb, opts = {}) {
  const rid = String(routeId || "").trim();
  if (!rid) return () => {};

  const col = collection(db, "routes", rid, "stops");
  const q = query(col, orderBy("order", "asc"));
  const path = col?.path ? String(col.path) : `routes/${rid}/stops`;

  const label = opts?.label ? String(opts.label) : "watchStops";
  const onError =
    typeof opts?.onError === "function" ? opts.onError : null;

  try {
    const unsub = safeOnSnapshot(
      q,
      (snap) => {
        try {
          const out = [];
          snap?.forEach?.((d) => out.push({ id: d.id, ...d.data() }));
          cb?.(out);
        } catch {
          // swallow
        }
      },
      (err) => {
        logSnapErrOnce(label, path, err);

        try {
          onError?.(err);
        } catch {}

        try {
          cb?.([]);
        } catch {}
      },
      {
        label,
        path,
        autoUnsubscribeOnPermissionDenied: true,
      }
    );

    return unsub;
  } catch {
    return () => {};
  }
}
