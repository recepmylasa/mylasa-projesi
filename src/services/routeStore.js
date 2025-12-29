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
  getDoc,
  query,
  orderBy,
  limit as qlimit,
  writeBatch,
  increment,
} from "firebase/firestore";

// ✅ PUBLIC_URL uyumlu default cover (subpath deploy güvenli)
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const DEFAULT_COVER_URL = `${PUBLIC_URL}/route-default-cover.jpg`;

/* -------------------- helpers -------------------- */

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

function safeNumNullable(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stripQueryAndHash(v) {
  const s = safeStr(v);
  if (!s) return "";
  return s.split(/[?#]/)[0];
}

function isPlaceholderCover(v) {
  const base = stripQueryAndHash(v).toLowerCase();
  if (!base) return false;
  const file = base.split("/").pop();

  // ✅ HOTFIX: route-default-cover.jpg da placeholder sayılır
  return (
    file === "mylasa-logo.png" ||
    file === "mylasa-logo.svg" ||
    file === "route-default-cover.jpg"
  );
}

function normalizeCoverUrl(v) {
  const s = safeStr(v);
  if (!s) return "";
  return isPlaceholderCover(s) ? "" : s;
}

function pickFirstString(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    const s = safeStr(v);
    if (s) return s;
  }
  return "";
}

function pickNestedString(obj, paths) {
  for (const p of paths) {
    const parts = String(p).split(".");
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (!cur || typeof cur !== "object") {
        ok = false;
        break;
      }
      cur = cur[part];
    }
    if (!ok) continue;
    const s = safeStr(cur);
    if (s) return s;
  }
  return "";
}

function extractFirstUrlFromArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  for (const it of arr) {
    if (!it) continue;
    if (typeof it === "string") {
      const s = safeStr(it);
      if (s) return s;
      continue;
    }
    if (typeof it === "object") {
      const direct = pickFirstString(it, [
        "url",
        "src",
        "mediaUrl",
        "imageUrl",
        "photoUrl",
        "downloadUrl",
        "downloadURL",
        "publicUrl",
        "fileUrl",
        "thumbnailUrl",
        "thumbUrl",
        "previewUrl",
      ]);
      if (direct) return direct;

      const nested = pickNestedString(it, [
        "file.url",
        "file.downloadUrl",
        "file.downloadURL",
        "asset.url",
        "asset.downloadUrl",
        "asset.downloadURL",
      ]);
      if (nested) return nested;
    }
  }
  return "";
}

function extractStopMediaUrl(stop) {
  if (!stop || typeof stop !== "object") return "";

  // 1) direkt alanlar
  const direct = pickFirstString(stop, [
    "mediaUrl",
    "mediaURL",
    "downloadUrl",
    "downloadURL",
    "url",
    "src",
    "imageUrl",
    "imageURL",
    "photoUrl",
    "photoURL",
    "publicUrl",
    "fileUrl",
    "signedUrl",
    "previewUrl",
    "previewURL",
    "gsUrl",
    "gsURL",
    "uri",
    "path",
    "fullPath",
    "storagePath",
  ]);
  if (direct) return direct;

  // 2) nested alanlar
  const nested = pickNestedString(stop, [
    "file.url",
    "file.downloadUrl",
    "file.downloadURL",
    "asset.url",
    "asset.downloadUrl",
    "asset.downloadURL",
    "media.url",
    "media.downloadUrl",
    "media.downloadURL",
  ]);
  if (nested) return nested;

  // 3) array paketleri
  const arr =
    stop.media ||
    stop.medias ||
    stop.gallery ||
    stop.items ||
    stop.photos ||
    stop.images ||
    stop.attachments ||
    stop.files ||
    null;

  const fromArr = extractFirstUrlFromArray(arr);
  if (fromArr) return fromArr;

  return "";
}

function extractStopThumbUrl(stop) {
  if (!stop || typeof stop !== "object") return "";

  const direct = pickFirstString(stop, [
    "thumbnailUrl",
    "thumbUrl",
    "thumbURL",
    "previewThumbUrl",
    "previewThumbnailUrl",
    "previewUrl",
    "downloadThumbnailUrl",
    "downloadThumbUrl",
  ]);
  if (direct) return direct;

  const nested = pickNestedString(stop, [
    "thumbnail.url",
    "thumb.url",
    "file.thumbUrl",
    "file.thumbnailUrl",
    "asset.thumbUrl",
    "asset.thumbnailUrl",
  ]);
  if (nested) return nested;

  // thumb bulunamazsa media’ya düş
  return extractStopMediaUrl(stop);
}

function normalizeStopForPreview(s) {
  const id = safeStr(s?.id);
  const order = safeNum(s?.order ?? s?.idx, 0);
  const title = safeStr(s?.title || s?.name || "");

  const lat = safeNumNullable(s?.lat);
  const lng = safeNumNullable(s?.lng);

  const mediaUrl = safeStr(extractStopMediaUrl(s));
  const thumbnailUrl = safeStr(extractStopThumbUrl(s));

  const out = {
    id,
    order,
    title,
    ...(lat !== null ? { lat } : {}),
    ...(lng !== null ? { lng } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };

  return out;
}

/**
 * Route summary’yi stops alt koleksiyonundan üretir ve route doc’a yazar.
 * - stopsPreview: array (1–2 eleman: ilk + son)
 * - stopsMeta: {has, length}
 * - startName/endName
 * - coverUrl/thumbnailUrl (medya varsa placeholder kalmaz)
 */
export async function recomputeRouteSummary(routeId) {
  if (!routeId) return;

  const routeRef = doc(db, "routes", routeId);
  const stopsCol = collection(db, "routes", routeId, "stops");

  try {
    // Mevcut route cover’ı placeholder değilse koru
    let existingCover = "";
    let existingThumb = "";
    try {
      const rSnap = await getDoc(routeRef);
      if (rSnap.exists()) {
        const raw = rSnap.data() || {};
        existingCover = normalizeCoverUrl(
          raw.coverUrl || raw.previewUrl || raw.imageUrl || raw.mediaUrl || ""
        );
        existingThumb = normalizeCoverUrl(raw.thumbnailUrl || raw.thumbUrl || "");
      }
    } catch {}

    // 1) ilk/son stop (order)
    const firstQ = query(stopsCol, orderBy("order", "asc"), qlimit(1));
    const lastQ = query(stopsCol, orderBy("order", "desc"), qlimit(1));

    const [firstSnap, lastSnap] = await Promise.all([
      getDocs(firstQ),
      getDocs(lastQ),
    ]);

    const firstStop = firstSnap.docs[0]
      ? { id: firstSnap.docs[0].id, ...firstSnap.docs[0].data() }
      : null;
    const lastStop = lastSnap.docs[0]
      ? { id: lastSnap.docs[0].id, ...lastSnap.docs[0].data() }
      : null;

    // 2) stop count / length (MVP)
    const lastOrderGuess = safeNum(lastStop?.order ?? lastStop?.idx, 0);
    const firstOrderGuess = safeNum(firstStop?.order ?? firstStop?.idx, 0);
    let length = Math.max(lastOrderGuess, firstOrderGuess, 0);

    if (!length) {
      const allSnap = await getDocs(query(stopsCol, qlimit(250)));
      length = allSnap.size || 0;
    }

    const stopsMeta = { has: length > 0, length };

    // 3) preview (ilk + son)
    const p1 = firstStop ? normalizeStopForPreview(firstStop) : null;
    const p2 =
      lastStop && (!firstStop || String(lastStop.id) !== String(firstStop.id))
        ? normalizeStopForPreview(lastStop)
        : null;

    const stopsPreview = [];
    if (p1) stopsPreview.push(p1);
    if (p2) stopsPreview.push(p2);

    const startName =
      safeStr(firstStop?.title || firstStop?.name || "") || safeStr(p1?.title);
    const endName =
      safeStr(lastStop?.title || lastStop?.name || "") ||
      safeStr(p2?.title || p1?.title);

    // 4) cover/thumbnail üretimi
    const firstMedia = firstStop ? safeStr(extractStopMediaUrl(firstStop)) : "";
    const lastMedia = lastStop ? safeStr(extractStopMediaUrl(lastStop)) : "";

    const firstThumb = firstStop ? safeStr(extractStopThumbUrl(firstStop)) : "";
    const lastThumb = lastStop ? safeStr(extractStopThumbUrl(lastStop)) : "";

    const computedCover =
      normalizeCoverUrl(firstMedia || lastMedia) || (stopsMeta.has ? "" : "");
    const computedThumb =
      normalizeCoverUrl(firstThumb || firstMedia || lastThumb || lastMedia) ||
      computedCover ||
      "";

    const hasMedia = Boolean(computedCover || computedThumb);

    // ✅ yazılacak cover: mevcut (placeholder değilse) > computed > default cover
    // HOTFIX sayesinde existingCover default ise "" olacak ve computedCover yazılacak.
    const coverUrl = existingCover || computedCover || DEFAULT_COVER_URL;
    const thumbnailUrl = existingThumb || computedThumb || coverUrl;

    await updateDoc(routeRef, {
      stopsMeta,
      stopsPreview,
      startName: startName || "",
      endName: endName || "",
      coverUrl,
      thumbnailUrl,
      hasMedia,
      summaryUpdatedAt: serverTimestamp(),
    });
  } catch (e) {}
}

/** Yeni rota oluşturur, routeId döner */
export async function createRoute({ ownerId, title = "", visibility = "public" }) {
  const routesCol = collection(db, "routes");

  const uid = auth.currentUser?.uid ? String(auth.currentUser.uid) : "";
  const oid = safeStr(ownerId) || uid;

  const payload = {
    ownerId: oid,
    title: safeStr(title),
    visibility: normalizeVisibility(visibility),
    status: "active",
    createdAt: serverTimestamp(),
    finishedAt: null,

    path: [],
    totalDistanceM: 0,
    durationMs: 0,
    bounds: null,

    // ✅ placeholder default cover (PUBLIC_URL uyumlu)
    coverUrl: DEFAULT_COVER_URL,
    thumbnailUrl: DEFAULT_COVER_URL,
    stopsPreview: [],
    stopsMeta: { has: false, length: 0 },
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

    const CHUNK = 30;
    for (let i = 0; i < pathChunk.length; i += CHUNK) {
      const slice = pathChunk.slice(i, i + CHUNK);
      await updateDoc(routeRef, { path: arrayUnion(...slice) }).catch(async () => {
        await setDoc(routeRef, { path: arrayUnion(...slice) }, { merge: true });
      });
    }
  } catch (e) {}
}

/** Alt koleksiyona durak ekler (ADIM 2: atomik + route meta update) */
export async function addStop(routeId, stop) {
  try {
    if (!routeId || !stop) return null;

    const routeRef = doc(db, "routes", routeId);

    const order = safeNum(stop.order ?? stop.idx, 0) || 1;
    const t = safeNum(stop.t, Date.now());
    const stopId = `stop_${order}_${t}`;

    const lat = safeNumNullable(stop.lat);
    const lng = safeNumNullable(stop.lng);
    if (lat == null || lng == null) return null;

    const stopsDoc = doc(db, "routes", routeId, "stops", stopId);

    const mediaUrl = safeStr(
      stop.mediaUrl ||
        stop.downloadUrl ||
        stop.downloadURL ||
        stop.url ||
        stop.src ||
        stop.photoUrl ||
        stop.photoURL ||
        stop.imageUrl ||
        stop.imageURL ||
        ""
    );

    const thumbnailUrl = safeStr(
      stop.thumbnailUrl ||
        stop.thumbUrl ||
        stop.thumbURL ||
        stop.previewUrl ||
        stop.previewURL ||
        mediaUrl ||
        ""
    );

    const title = safeStr(stop.title || stop.name || "");
    const name = safeStr(stop.name || stop.title || "");

    const batch = writeBatch(db);

    batch.set(stopsDoc, {
      order,
      idx: order,
      lat,
      lng,
      loc: { lat, lng },
      t,
      title,
      name,
      note: safeStr(stop.note),
      createdAt: serverTimestamp(),

      mediaUrl,
      thumbnailUrl,

      ...(safeStr(stop.downloadUrl) ? { downloadUrl: safeStr(stop.downloadUrl) } : {}),
      ...(safeStr(stop.downloadURL) ? { downloadURL: safeStr(stop.downloadURL) } : {}),
    });

    batch.update(routeRef, {
      stopsCount: increment(1),
      lastStopAt: serverTimestamp(),
      updatedAt: serverTimestamp(),

      stopsMetaLastTitle: title,
      stopsMetaLastLoc: { lat, lng },
      stopsMetaLastOrder: order,
      stopsMetaLastClientT: t,
    });

    await batch.commit();
    return stopId;
  } catch (e) {
    if (String(e?.code || "").toLowerCase() === "permission-denied") {
      console.error(`addStop permission-denied routes/${routeId}/stops`);
    }
    return null;
  }
}

/**
 * Rotayı sonlandırır; özet değerleri yazar + route summary’yi garanti doldurur
 */
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

    await recomputeRouteSummary(routeId);
  } catch (e) {}
}

/* -------------------- EMIR-17: cover helpers -------------------- */

// ✅ Kullanıcı seçimi: picked cover (kalıcı; recompute placeholder değilse ezmez)
export async function setRouteCoverPicked(routeId, { url, stopId, mediaId } = {}) {
  try {
    const rid = safeStr(routeId);
    const pickedUrl = normalizeCoverUrl(url);
    if (!rid || !pickedUrl) return;

    const routeRef = doc(db, "routes", rid);

    await updateDoc(routeRef, {
      cover: {
        kind: "picked",
        url: pickedUrl,
        ...(safeStr(stopId) ? { stopId: safeStr(stopId) } : {}),
        ...(safeStr(mediaId) ? { mediaId: safeStr(mediaId) } : {}),
        updatedAt: serverTimestamp(),
      },
      coverUrl: pickedUrl,
      thumbnailUrl: pickedUrl,
      hasMedia: true,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    if (String(e?.code || "").toLowerCase() === "permission-denied") {
      console.error(`setRouteCoverPicked permission-denied routes/${routeId}`);
    }
  }
}

// ✅ Kapağı kaldır (minimum): auto/default’a düş; resolver default/auto’ya döner
export async function clearRouteCover(routeId) {
  try {
    const rid = safeStr(routeId);
    if (!rid) return;

    const routeRef = doc(db, "routes", rid);

    await updateDoc(routeRef, {
      cover: {
        kind: "auto",
        url: "",
        updatedAt: serverTimestamp(),
      },
      coverUrl: DEFAULT_COVER_URL,
      thumbnailUrl: DEFAULT_COVER_URL,
      hasMedia: false,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    if (String(e?.code || "").toLowerCase() === "permission-denied") {
      console.error(`clearRouteCover permission-denied routes/${routeId}`);
    }
  }
}
