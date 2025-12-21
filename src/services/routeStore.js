// src/services/routeStore.js
// Firestore CRUD (hata toleranslı, idempotent)

import { auth, db } from "../firebase";
import {
  addDoc,
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit as qlimit,
} from "firebase/firestore";

const PLACEHOLDER_COVER = "/mylasa-logo.png";

function normalizeVisibility(v) {
  return v === "followers" ? "followers" : v === "private" ? "private" : "public";
}

function safeStr(v) {
  return String(v || "").trim();
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStopForPreview(s) {
  const id = safeStr(s?.id);
  const order = safeNum(s?.order ?? s?.idx, 0);
  const title = safeStr(s?.title || s?.name || "");
  const lat = safeNum(s?.lat, 0);
  const lng = safeNum(s?.lng, 0);

  const mediaUrl = safeStr(s?.mediaUrl || "");
  const thumbnailUrl = safeStr(s?.thumbnailUrl || "");

  return {
    id,
    order,
    title,
    lat,
    lng,
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

/**
 * Route summary’yi stops alt koleksiyonundan üretir ve route doc’a yazar.
 * - stopsPreview: array (1–2 eleman: ilk + son)
 * - stopsMeta: {has, length}
 * - startName/endName
 * - coverUrl/thumbnailUrl (boş kalmaz; medya yoksa placeholder)
 */
export async function recomputeRouteSummary(routeId) {
  if (!routeId) return;

  const routeRef = doc(db, "routes", routeId);
  const stopsCol = collection(db, "routes", routeId, "stops");

  try {
    // 1) stops sayısı + ilk/son
    const firstQ = query(stopsCol, orderBy("order", "asc"), qlimit(1));
    const lastQ = query(stopsCol, orderBy("order", "desc"), qlimit(1));

    const [firstSnap, lastSnap] = await Promise.all([getDocs(firstQ), getDocs(lastQ)]);

    const firstStop = firstSnap.docs[0] ? { id: firstSnap.docs[0].id, ...firstSnap.docs[0].data() } : null;
    const lastStop = lastSnap.docs[0] ? { id: lastSnap.docs[0].id, ...lastSnap.docs[0].data() } : null;

    // length için küçük bir “count” yaklaşımı (MVP): tüm stops’u çekmeden,
    // order alanı düzgünse lastStop.order ile de tahmin edilebilir; ama güvenli olsun:
    // (stop sayısı az/orta bekleniyor)
    const allSnap = await getDocs(query(stopsCol, qlimit(250)));
    const length = allSnap.size || 0;

    const stopsMeta = { has: length > 0, length };

    const p1 = firstStop ? normalizeStopForPreview(firstStop) : null;
    const p2 =
      lastStop && (!firstStop || String(lastStop.id) !== String(firstStop.id))
        ? normalizeStopForPreview(lastStop)
        : null;

    const stopsPreview = [];
    if (p1) stopsPreview.push(p1);
    if (p2) stopsPreview.push(p2);

    const startName = safeStr(firstStop?.title || firstStop?.name || "");
    const endName = safeStr(lastStop?.title || lastStop?.name || "");

    const firstMedia = safeStr(firstStop?.mediaUrl || "");
    const lastMedia = safeStr(lastStop?.mediaUrl || "");

    const firstThumb = safeStr(firstStop?.thumbnailUrl || "");
    const lastThumb = safeStr(lastStop?.thumbnailUrl || "");

    const coverUrl = firstMedia || lastMedia || PLACEHOLDER_COVER;
    const thumbnailUrl = firstThumb || firstMedia || lastThumb || lastMedia || coverUrl;

    await updateDoc(routeRef, {
      stopsMeta,
      stopsPreview, // ✅ array
      startName: startName || (stopsMeta.has ? safeStr(p1?.title) : ""),
      endName: endName || (stopsMeta.has ? safeStr(p2?.title || p1?.title) : ""),
      coverUrl,
      thumbnailUrl,
      hasMedia: Boolean(firstMedia || lastMedia),
    });
  } catch (e) {
    // sessiz tolerans
    // console.warn("recomputeRouteSummary error:", e);
  }
}

/** Yeni rota oluşturur, routeId döner */
export async function createRoute({ ownerId, title = "", visibility = "public" }) {
  const routesCol = collection(db, "routes");

  // ✅ ownerId boş gelirse currentUser’dan doldur (stop rules’ı bunun yüzünden patlıyordu)
  const uid = auth.currentUser?.uid ? String(auth.currentUser.uid) : "";
  const oid = safeStr(ownerId) || uid;

  const payload = {
    ownerId: oid, // ✅ asla "" olmasın
    title: safeStr(title),
    visibility: normalizeVisibility(visibility),
    status: "active",
    createdAt: serverTimestamp(),
    finishedAt: null,

    // recording stats
    path: [],
    totalDistanceM: 0,
    durationMs: 0,
    bounds: null,

    // ✅ Route-level cover standardı (başlangıçta bile alanlar var)
    coverUrl: PLACEHOLDER_COVER,
    thumbnailUrl: PLACEHOLDER_COVER,
    stopsPreview: [], // ✅ array
    stopsMeta: { has: false, length: 0 }, // ✅ object
    startName: "",
    endName: "",
    hasMedia: false,
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
      await updateDoc(routeRef, { path: arrayUnion(...slice) }).catch(async () => {
        await setDoc(routeRef, { path: arrayUnion(...slice) }, { merge: true });
      });
    }
  } catch (e) {
    // console.warn("appendPath error:", e);
  }
}

/** Alt koleksiyona durak ekler */
export async function addStop(routeId, stop) {
  try {
    if (!routeId || !stop) return null;

    const stopsCol = collection(db, "routes", routeId, "stops");

    const order = safeNum(stop.order ?? stop.idx, 0) || 1;

    const ref = await addDoc(stopsCol, {
      order,
      idx: order, // ✅ legacy uyum
      lat: safeNum(stop.lat, 0),
      lng: safeNum(stop.lng, 0),
      t: safeNum(stop.t, Date.now()),
      title: safeStr(stop.title || stop.name || ""),
      name: safeStr(stop.name || stop.title || ""), // ✅ farklı ekranlar farklı isim kullanıyor olabilir
      note: safeStr(stop.note),
      createdAt: serverTimestamp(),

      // ✅ cover üretimi için hazır alanlar (upload sonrası doldurulur)
      mediaUrl: safeStr(stop.mediaUrl || ""),
      thumbnailUrl: safeStr(stop.thumbnailUrl || ""),
    });

    return ref.id;
  } catch (e) {
    // console.warn("addStop error:", e);
    return null;
  }
}

/** Rotayı sonlandırır; özet değerleri yazar + route summary’yi garanti doldurur */
export async function finishRoute(routeId, stats) {
  try {
    if (!routeId || !stats) return;
    const routeRef = doc(db, "routes", routeId);

    await updateDoc(routeRef, {
      status: "finished",
      finishedAt: serverTimestamp(),
      totalDistanceM: safeNum(stats.totalDistanceM, 0),
      durationMs: safeNum(stats.durationMs, 0),
      bounds: stats.bounds || null,
      ...(stats.title ? { title: safeStr(stats.title) } : {}),
      ...(stats.visibility ? { visibility: normalizeVisibility(stats.visibility) } : {}),
    });

    // ✅ “cover + durak önizleme” yazma garantisi
    await recomputeRouteSummary(routeId);
  } catch (e) {
    // console.warn("finishRoute error:", e);
  }
}
