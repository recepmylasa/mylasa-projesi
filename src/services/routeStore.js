// src/services/routeStore.js
// Firestore CRUD (hata toleranslı, idempotent)

import { db } from "../firebase";
import {
  addDoc, collection, doc, updateDoc, serverTimestamp, arrayUnion, setDoc,
} from "firebase/firestore";

/** Yeni rota oluşturur, routeId döner */
export async function createRoute({ ownerId, title = "", visibility = "public" }) {
  const routesCol = collection(db, "routes");
  const payload = {
    ownerId: String(ownerId || ""),
    title: String(title || ""),
    visibility: visibility === "followers" ? "followers" : visibility === "private" ? "private" : "public",
    status: "active",
    createdAt: serverTimestamp(),
    finishedAt: null,
    path: [],
    totalDistanceM: 0,
    durationMs: 0,
    bounds: null,
  };
  const ref = await addDoc(routesCol, payload);
  return ref.id;
}

/** Path’e artımlı ekleme. Çoklu yazımlarda küçük parçalara böler. */
export async function appendPath(routeId, pathChunk) {
  try {
    if (!routeId || !Array.isArray(pathChunk) || pathChunk.length === 0) return;
    const routeRef = doc(db, "routes", routeId);

    // Firestore arrayUnion çağrısına 30’lu parçalara bölelim
    const CHUNK = 30;
    for (let i = 0; i < pathChunk.length; i += CHUNK) {
      const slice = pathChunk.slice(i, i + CHUNK);
      // Alan yoksa arrayUnion otomatik oluşturur
      await updateDoc(routeRef, { path: arrayUnion(...slice) }).catch(async () => {
        // İlk yazımda alan yoksa setDoc merge ile dener
        await setDoc(routeRef, { path: arrayUnion(...slice) }, { merge: true });
      });
    }
  } catch (e) {
    // Sessiz tolerans (MVP); arayüz çökmesin
    // console.warn("appendPath error:", e);
  }
}

/** Alt koleksiyona durak ekler */
export async function addStop(routeId, stop) {
  try {
    if (!routeId || !stop) return null;
    const stopsCol = collection(db, "routes", routeId, "stops");
    const ref = await addDoc(stopsCol, {
      order: Number(stop.order) || 1,
      lat: Number(stop.lat),
      lng: Number(stop.lng),
      t: Number(stop.t),
      title: String(stop.title || ""),
      note: String(stop.note || ""),
    });
    return ref.id;
  } catch (e) {
    // console.warn("addStop error:", e);
    return null;
  }
}

/** Rotayı sonlandırır; özet değerleri yazar */
export async function finishRoute(routeId, stats) {
  try {
    if (!routeId || !stats) return;
    const routeRef = doc(db, "routes", routeId);
    await updateDoc(routeRef, {
      status: "finished",
      finishedAt: serverTimestamp(),
      totalDistanceM: Number(stats.totalDistanceM) || 0,
      durationMs: Number(stats.durationMs) || 0,
      bounds: stats.bounds || null,
    });
  } catch (e) {
    // console.warn("finishRoute error:", e);
  }
}
