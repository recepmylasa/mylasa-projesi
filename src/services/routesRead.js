// src/services/routesRead.js
// Rota okuma servisleri (yalnızca READ). Hata toleranslı.

import { db } from "../firebase";
import {
  doc, getDoc, onSnapshot,
  collection, query, where, orderBy, limit as qLimit, getDocs
} from "firebase/firestore";

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
export function watchRoute(routeId, cb) {
  try {
    const ref = doc(db, "routes", String(routeId || ""));
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return cb(null);
      cb({ id: snap.id, ...snap.data() });
    });
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
export function watchStops(routeId, cb) {
  try {
    const col = collection(db, "routes", String(routeId || ""), "stops");
    const q = query(col, orderBy("order", "asc"));
    return onSnapshot(q, (snap) => {
      const out = [];
      snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
      cb(out);
    });
  } catch {
    return () => {};
  }
}
