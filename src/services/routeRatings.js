// src/services/routeRatings.js
// Rota ve durak puanlama servisleri (1..5). Transaction ile tutarlı sayım.

// Not: Kurallar tarafında kendi rotana/durağına oy verme zaten engelleniyor.
// Burada da basit bir koruma var (owner check), fakat nihai otorite rules.

import { auth, db } from "../firebase";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

/** Dahili yardımcı: 1..5 doğrula, değilse throw */
function normValue(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    throw new Error("Rating value must be 1..5");
  }
  return Math.round(n);
}

/** Rota oyu ver / güncelle (idempotent) */
export async function setRouteRating(routeId, value) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const val = normValue(value);

  const routeRef = doc(db, "routes", String(routeId));
  const myRatingRef = doc(db, "route_ratings", `${routeId}_${user.uid}`);

  await runTransaction(db, async (tx) => {
    const routeSnap = await tx.get(routeRef);
    if (!routeSnap.exists()) throw new Error("Route not found");

    const route = routeSnap.data() || {};
    // Sahibi kendi rotasına oy veremesin (UI’da da kapatıyoruz; rules da engelliyor)
    if (route.ownerId === user.uid) throw new Error("Cannot rate own route");

    const ratingSnap = await tx.get(myRatingRef);
    const prev = ratingSnap.exists() ? Number(ratingSnap.data().value) : null;

    let ratingSum = Number(route.ratingSum || 0);
    let ratingCount = Number(route.ratingCount || 0);

    if (prev == null) {
      ratingSum += val;
      ratingCount += 1;
    } else {
      ratingSum += (val - prev);
    }

    const ratingAvg = ratingCount > 0 ? ratingSum / ratingCount : 0;

    tx.update(routeRef, {
      ratingSum,
      ratingCount,
      ratingAvg, // hız için saklıyoruz
      ratingUpdatedAt: serverTimestamp(),
    });

    tx.set(myRatingRef, {
      routeId: String(routeId),
      userId: user.uid,
      value: val,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Durak oyu ver / güncelle (idempotent) */
export async function setStopRating(stopId, routeId, value) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const val = normValue(value);

  const stopRef = doc(db, "routes", String(routeId), "stops", String(stopId));
  const routeRef = doc(db, "routes", String(routeId)); // owner kontrolü
  const myRatingRef = doc(db, "stop_ratings", `${stopId}_${user.uid}`);

  await runTransaction(db, async (tx) => {
    const [routeSnap, stopSnap, ratingSnap] = await Promise.all([
      tx.get(routeRef),
      tx.get(stopRef),
      tx.get(myRatingRef),
    ]);

    if (!stopSnap.exists()) throw new Error("Stop not found");
    if (!routeSnap.exists()) throw new Error("Route not found");

    const route = routeSnap.data() || {};
    if (route.ownerId === user.uid) throw new Error("Cannot rate own stop");

    const stop = stopSnap.data() || {};
    let ratingSum = Number(stop.ratingSum || 0);
    let ratingCount = Number(stop.ratingCount || 0);

    const prev = ratingSnap.exists() ? Number(ratingSnap.data().value) : null;
    if (prev == null) { ratingSum += val; ratingCount += 1; }
    else { ratingSum += (val - prev); }

    const ratingAvg = ratingCount > 0 ? ratingSum / ratingCount : 0;

    tx.update(stopRef, { ratingSum, ratingCount, ratingAvg, ratingUpdatedAt: serverTimestamp() });
    tx.set(myRatingRef, {
      stopId: String(stopId),
      routeId: String(routeId),
      userId: user.uid,
      value: val,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Yardımcılar: Belgeden avg hesaplamak için */
export function computeAvg(sum, count) {
  const s = Number(sum || 0);
  const c = Number(count || 0);
  return c > 0 ? s / c : 0;
}
