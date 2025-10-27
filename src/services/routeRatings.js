// src/services/routeRatings.js
// Rota ve durak puanlama servisleri (1..5).
// Not: Agregasyon artık tamamen **Cloud Functions** tarafında.
// Burada sadece *_ratings koleksiyonlarına idempotent yazım yapıyoruz.

import { auth, db } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
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

  // (Opsiyonel) Sahiplik kontrolü: kullanıcı kendi rotasını oylamasın
  const routeSnap = await getDoc(routeRef);
  if (!routeSnap.exists()) throw new Error("Route not found");
  const route = routeSnap.data() || {};
  if (route.ownerId === user.uid) throw new Error("Cannot rate own route");

  await setDoc(myRatingRef, {
    routeId: String(routeId),
    userId: user.uid,
    value: val,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Not: Ortalama/sayım güncellemesi backend tetiklerinden gelir.
}

/** Durak oyu ver / güncelle (idempotent) */
export async function setStopRating(stopId, routeId, value) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const val = normValue(value);

  const routeRef = doc(db, "routes", String(routeId)); // owner check
  const stopRefPath = ["routes", String(routeId), "stops", String(stopId)];
  const myRatingRef = doc(db, "stop_ratings", `${stopId}_${user.uid}`);

  // (Opsiyonel) Sahiplik kontrolü
  const routeSnap = await getDoc(routeRef);
  if (!routeSnap.exists()) throw new Error("Route not found");
  const route = routeSnap.data() || {};
  if (route.ownerId === user.uid) throw new Error("Cannot rate own stop");

  // Stop var mı (hata mesajını erken vermek için hafif kontrol)
  // Kurallar zaten korur; yoksa bu kontrol atlanabilir.
  // eslint-disable-next-line no-unused-vars
  const [_c1, rid, _c2, sid] = stopRefPath; // sadece path kurmak için
  // Firestore SDK'da stop varlığını okumak masraflı olabilir; kurallara güveniyoruz.

  await setDoc(myRatingRef, {
    stopId: String(stopId),
    routeId: String(routeId),
    userId: user.uid,
    value: val,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Not: Ortalama/sayım güncellemesi backend tetiklerinden gelir.
}

/** Yardımcı: Belgeden avg hesaplamak için (UI tarafında iyimser gösterim için) */
export function computeAvg(sum, count) {
  const s = Number(sum || 0);
  const c = Number(count || 0);
  return c > 0 ? s / c : 0;
}
