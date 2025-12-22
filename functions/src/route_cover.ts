// functions/src/route_cover.ts
// Route-level cover standardı: coverUrl + thumbnailUrl + coverSource + coverUpdatedAt + stopsMeta + stopsPreview + start/end
// Backend garantisi: stop/media sonradan eklense bile route doc cover alanları güncellenir.

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

type LatLng = { lat: number; lng: number };
type CoverSource = "manual" | "auto" | "default";

const DEFAULT_COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1f2a44"/>
    <stop offset="1" stop-color="#6b2d5c"/>
  </linearGradient>
</defs>
<rect width="1200" height="675" fill="url(#g)"/>
<circle cx="320" cy="220" r="230" fill="rgba(255,255,255,0.08)"/>
<circle cx="920" cy="500" r="300" fill="rgba(255,255,255,0.06)"/>
<path d="M600 210c-90 0-163 73-163 163 0 122 163 292 163 292s163-170 163-292c0-90-73-163-163-163zm0 240a77 77 0 1 1 0-154 77 77 0 0 1 0 154z"
  fill="rgba(255,255,255,0.88)"/>
<text x="600" y="610" font-family="system-ui,-apple-system,Segoe UI,Roboto,Arial" font-size="44" text-anchor="middle" fill="rgba(255,255,255,0.92)">Rota</text>
</svg>`;

const DEFAULT_COVER_DATA_URL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(DEFAULT_COVER_SVG);

function isNonEmptyString(x: any): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function toFiniteNumber(x: any): number | undefined {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function asPoint(p: any): LatLng | null {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) {
    const [lat, lng] = p;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (typeof p === "object") {
    const lat = (p as any).lat ?? (p as any).latitude;
    const lng = (p as any).lng ?? (p as any).longitude ?? (p as any).lon;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function pickStopTitle(stop: any): string {
  const t =
    (typeof stop?.title === "string" && stop.title) ||
    (typeof stop?.name === "string" && stop.name) ||
    (typeof stop?.label === "string" && stop.label) ||
    "";
  return String(t).trim();
}

function buildStopPreview(stopId: string, stopData: any) {
  const title = pickStopTitle(stopData);
  const loc = asPoint(stopData?.location || stopData);
  const createdAt = stopData?.createdAt || stopData?.ts || null;

  // stopsPreview = min 1, ideal 2 (first + last). Lightweight.
  return {
    id: String(stopId),
    title: title || "Durak",
    location: loc ? { lat: loc.lat, lng: loc.lng } : null,
    createdAt: createdAt || null,
  };
}

function isImageMedia(media: any): boolean {
  const mime = (media?.mimeType || media?.mime || media?.contentType || "").toString().toLowerCase();
  const type = (media?.type || media?.mediaType || "").toString().toLowerCase();
  const url = (media?.url || media?.downloadURL || media?.downloadUrl || media?.src || media?.imageUrl || "").toString();

  if (mime.includes("image/")) return true;
  if (type === "image" || type === "photo") return true;
  if (/\.(png|jpg|jpeg|webp|gif)(\?|#|$)/i.test(url)) return true;
  return false;
}

function pickMediaUrls(media: any): { coverUrl?: string; thumbnailUrl?: string } {
  const coverUrl =
    (isNonEmptyString(media?.url) && media.url) ||
    (isNonEmptyString(media?.downloadURL) && media.downloadURL) ||
    (isNonEmptyString(media?.downloadUrl) && media.downloadUrl) ||
    (isNonEmptyString(media?.src) && media.src) ||
    (isNonEmptyString(media?.imageUrl) && media.imageUrl) ||
    "";

  const thumbnailUrl =
    (isNonEmptyString(media?.thumbnailUrl) && media.thumbnailUrl) ||
    (isNonEmptyString(media?.thumbUrl) && media.thumbUrl) ||
    (isNonEmptyString(media?.thumb) && media.thumb) ||
    (isNonEmptyString(media?.previewUrl) && media.previewUrl) ||
    "";

  return {
    coverUrl: isNonEmptyString(coverUrl) ? coverUrl : undefined,
    thumbnailUrl: isNonEmptyString(thumbnailUrl) ? thumbnailUrl : undefined,
  };
}

function deriveTotalDistanceM(route: any): number | undefined {
  // Route doc içinde farklı yerlerde durabiliyor olabilir; varsa çek.
  const direct = toFiniteNumber(route?.totalDistanceM);
  if (direct && direct > 0) return direct;

  const statsA = toFiniteNumber(route?.stats?.totalDistanceM);
  if (statsA && statsA > 0) return statsA;

  const statsB = toFiniteNumber(route?.stats?.distanceM);
  if (statsB && statsB > 0) return statsB;

  const track = toFiniteNumber(route?.track?.distanceM);
  if (track && track > 0) return track;

  return undefined;
}

function shouldAutoReplaceCover(route: any): boolean {
  const cs: CoverSource | string = (route?.coverSource || "").toString() as any;
  const coverUrl = route?.coverUrl;

  if (cs === "manual" && isNonEmptyString(coverUrl)) return false;
  // default iken veya boşken auto ile değişebilir
  if (!isNonEmptyString(coverUrl)) return true;
  if (cs === "default") return true;
  if (isNonEmptyString(coverUrl) && coverUrl.startsWith("data:image/svg+xml")) return true; // bizim default
  return false;
}

function ensureDefaultCoverPatch(route: any): Partial<any> | null {
  const coverUrl = route?.coverUrl;
  const thumbUrl = route?.thumbnailUrl;
  const cs: CoverSource | string = (route?.coverSource || "").toString() as any;

  // manual cover varsa default basma
  if (cs === "manual" && isNonEmptyString(coverUrl)) {
    const patch: any = {};
    if (!isNonEmptyString(thumbUrl)) patch.thumbnailUrl = coverUrl;
    if (!isNonEmptyString(route?.coverUpdatedAt)) patch.coverUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
    return Object.keys(patch).length ? patch : null;
  }

  // coverUrl yoksa default setle
  if (!isNonEmptyString(coverUrl)) {
    return {
      coverUrl: DEFAULT_COVER_DATA_URL,
      thumbnailUrl: DEFAULT_COVER_DATA_URL,
      coverSource: "default",
      coverUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
  }

  // coverUrl var ama thumb yoksa tamamla
  if (isNonEmptyString(coverUrl) && !isNonEmptyString(thumbUrl)) {
    return {
      thumbnailUrl: coverUrl,
      coverUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      coverSource: (cs === "manual" ? "manual" : (cs as CoverSource) || "auto"),
    };
  }

  // coverSource yoksa doldur (mevcut coverUrl ile)
  if (!isNonEmptyString(route?.coverSource)) {
    return {
      coverSource: "auto",
      coverUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
  }

  return null;
}

/* =========================
   Trigger A: Stop create → stopsMeta + stopsPreview + start/end + totalDistanceM
   ========================= */
export const onRouteStopCreate = functions
  .region("us-central1")
  .firestore.document("routes/{routeId}/stops/{stopId}")
  .onCreate(async (snap, ctx) => {
    const { routeId, stopId } = ctx.params as any;

    const routeRef = db.collection("routes").doc(String(routeId));
    const stopData = snap.data() || {};
    const stopPreview = buildStopPreview(String(stopId), stopData);

    await db.runTransaction(async (t) => {
      const routeSnap = await t.get(routeRef);
      if (!routeSnap.exists) return;

      const r = routeSnap.data() || {};
      const existingPreview: any[] = Array.isArray(r.stopsPreview) ? r.stopsPreview : [];
      const existingMeta = r.stopsMeta && typeof r.stopsMeta === "object" ? r.stopsMeta : {};
      const prevLen = toFiniteNumber(existingMeta.length) || 0;

      const nextLen = prevLen + 1;

      // stopsPreview: [first, last] mantığı
      let nextPreview: any[] = [];
      if (existingPreview.length === 0) nextPreview = [stopPreview];
      else if (existingPreview.length === 1) nextPreview = [existingPreview[0], stopPreview];
      else nextPreview = [existingPreview[0], stopPreview];

      const startName = isNonEmptyString(r.startName) ? r.startName : (nextPreview?.[0]?.title || "");
      const endName = isNonEmptyString(r.endName) ? r.endName : (nextPreview?.[nextPreview.length - 1]?.title || "");

      const patch: any = {
        stopsMeta: { has: true, length: nextLen },
        stopsPreview: nextPreview,
      };

      if (!isNonEmptyString(r.startName) && isNonEmptyString(startName)) patch.startName = startName;
      if (!isNonEmptyString(r.endName) && isNonEmptyString(endName)) patch.endName = endName;

      const dist = deriveTotalDistanceM(r);
      if ((!toFiniteNumber(r.totalDistanceM) || (toFiniteNumber(r.totalDistanceM) || 0) === 0) && dist && dist > 0) {
        patch.totalDistanceM = dist;
      }

      // cover default garanti (route doc boş geliyorsa)
      const coverPatch = ensureDefaultCoverPatch(r);
      if (coverPatch) Object.assign(patch, coverPatch);

      t.set(routeRef, patch, { merge: true });
    });
  });

/* =========================
   Trigger B: Media create → cover auto set (manual değilse)
   ========================= */
export const onRouteStopMediaCreate = functions
  .region("us-central1")
  .firestore.document("routes/{routeId}/stops/{stopId}/media/{mediaId}")
  .onCreate(async (snap, ctx) => {
    const { routeId } = ctx.params as any;
    const routeRef = db.collection("routes").doc(String(routeId));

    const media = snap.data() || {};
    if (!isImageMedia(media)) return;

    const { coverUrl, thumbnailUrl } = pickMediaUrls(media);
    if (!isNonEmptyString(coverUrl)) return;

    await db.runTransaction(async (t) => {
      const routeSnap = await t.get(routeRef);
      if (!routeSnap.exists) return;

      const r = routeSnap.data() || {};
      const cs: CoverSource | string = (r.coverSource || "").toString() as any;

      // manual ise dokunma
      if (cs === "manual" && isNonEmptyString(r.coverUrl)) return;

      // auto replace koşulu (default iken veya boşken)
      if (!shouldAutoReplaceCover(r)) return;

      t.set(
        routeRef,
        {
          coverUrl,
          thumbnailUrl: isNonEmptyString(thumbnailUrl) ? thumbnailUrl : coverUrl,
          coverSource: "auto",
          coverUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  });

/* =========================
   Trigger C (opsiyonel ama kritik): Route write → cover boşsa default bas
   Not: default iken media gelince Trigger B auto ile değiştirir.
   ========================= */
export const onRouteWriteEnsureCoverDefault = functions
  .region("us-central1")
  .firestore.document("routes/{routeId}")
  .onWrite(async (change) => {
    const after = change.after.exists ? (change.after.data() || {}) : null;
    if (!after) return;

    const before = change.before.exists ? (change.before.data() || {}) : {};
    // Sonsuz döngüyü önlemek için: sadece gerçekten eksik alanları setle
    const patch = ensureDefaultCoverPatch(after);
    if (!patch) return;

    // Eğer önce de aynı default ise tekrar yazma
    const beforeCover = (before as any)?.coverUrl;
    const afterCover = (after as any)?.coverUrl;

    const patchCover = (patch as any)?.coverUrl;
    if (isNonEmptyString(patchCover) && isNonEmptyString(afterCover) && afterCover === patchCover && beforeCover === afterCover) {
      // sadece cover için aynı ise diğer alanlar eksik olabilir, patch yine uygulanmalı
    }

    await change.after.ref.set(patch, { merge: true });
  });

/* =========================
   Callable: Backfill Route Covers (mevcut rotalar)
   - coverUrl boşsa: ilk foto varsa auto; yoksa default
   - stopsMeta/stopsPreview/start/end standardına çeker
   ========================= */
export const backfillRouteCoversCallable = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");

    const pageSize = Math.min(Number(data?.pageSize || 25), 50);
    let scanned = 0,
      updated = 0,
      errors = 0;

    let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;

    for (let page = 0; page < 8; page++) {
      let q = db.collection("routes").limit(pageSize);
      if (last) q = q.startAfter(last);

      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        scanned++;
        last = doc;

        try {
          const routeRef = doc.ref;
          const r = doc.data() || {};
          const cs: CoverSource | string = (r.coverSource || "").toString() as any;

          // stops -> first/last/len
          const stopsCol = routeRef.collection("stops");
          let firstStopSnap: FirebaseFirestore.QuerySnapshot | null = null;
          let lastStopSnap: FirebaseFirestore.QuerySnapshot | null = null;

          try {
            firstStopSnap = await stopsCol.orderBy("createdAt", "asc").limit(1).get();
            lastStopSnap = await stopsCol.orderBy("createdAt", "desc").limit(1).get();
          } catch {
            // createdAt yoksa docId ile
            firstStopSnap = await stopsCol.orderBy(admin.firestore.FieldPath.documentId(), "asc").limit(1).get();
            lastStopSnap = await stopsCol.orderBy(admin.firestore.FieldPath.documentId(), "desc").limit(1).get();
          }

          const firstStopDoc = firstStopSnap?.docs?.[0];
          const lastStopDoc = lastStopSnap?.docs?.[0];

          const preview: any[] = [];
          if (firstStopDoc) preview.push(buildStopPreview(firstStopDoc.id, firstStopDoc.data() || {}));
          if (lastStopDoc && (!firstStopDoc || lastStopDoc.id !== firstStopDoc.id))
            preview.push(buildStopPreview(lastStopDoc.id, lastStopDoc.data() || {}));

          let stopsLen = 0;
          try {
            const allStops = await stopsCol.get();
            stopsLen = allStops.size;
          } catch {
            stopsLen = Array.isArray(r?.stops) ? r.stops.length : 0;
          }

          const patch: any = {
            stopsMeta: { has: stopsLen > 0, length: stopsLen },
          };
          if (preview.length) patch.stopsPreview = preview;

          const startName = isNonEmptyString(r.startName) ? r.startName : (preview?.[0]?.title || "");
          const endName = isNonEmptyString(r.endName) ? r.endName : (preview?.[preview.length - 1]?.title || "");
          if (!isNonEmptyString(r.startName) && isNonEmptyString(startName)) patch.startName = startName;
          if (!isNonEmptyString(r.endName) && isNonEmptyString(endName)) patch.endName = endName;

          const dist = deriveTotalDistanceM(r);
          if ((!toFiniteNumber(r.totalDistanceM) || (toFiniteNumber(r.totalDistanceM) || 0) === 0) && dist && dist > 0) {
            patch.totalDistanceM = dist;
          }

          // cover logic
          if (cs === "manual" && isNonEmptyString(r.coverUrl)) {
            // sadece thumb eksikse tamamla
            if (!isNonEmptyString(r.thumbnailUrl)) patch.thumbnailUrl = r.coverUrl;
            if (!isNonEmptyString(r.coverUpdatedAt)) patch.coverUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
          } else {
            // ilk foto ara: stops içinde sırayla media limit 1
            let foundUrl: string | undefined;
            let foundThumb: string | undefined;

            if (firstStopDoc) {
              // küçük tarama: firstStop -> media
              try {
                const m = await firstStopDoc.ref.collection("media").orderBy("createdAt", "asc").limit(3).get();
                for (const md of m.docs) {
                  const d = md.data() || {};
                  if (!isImageMedia(d)) continue;
                  const u = pickMediaUrls(d);
                  if (isNonEmptyString(u.coverUrl)) {
                    foundUrl = u.coverUrl;
                    foundThumb = isNonEmptyString(u.thumbnailUrl) ? u.thumbnailUrl : u.coverUrl;
                    break;
                  }
                }
              } catch {}
            }

            // eğer firstStop’ta yoksa: lastStop’ta da dene
            if (!foundUrl && lastStopDoc) {
              try {
                const m = await lastStopDoc.ref.collection("media").orderBy("createdAt", "asc").limit(3).get();
                for (const md of m.docs) {
                  const d = md.data() || {};
                  if (!isImageMedia(d)) continue;
                  const u = pickMediaUrls(d);
                  if (isNonEmptyString(u.coverUrl)) {
                    foundUrl = u.coverUrl;
                    foundThumb = isNonEmptyString(u.thumbnailUrl) ? u.thumbnailUrl : u.coverUrl;
                    break;
                  }
                }
              } catch {}
            }

            if (foundUrl) {
              // auto cover
              patch.coverUrl = foundUrl;
              patch.thumbnailUrl = foundThumb || foundUrl;
              patch.coverSource = "auto";
              patch.coverUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
            } else {
              // default
              if (!isNonEmptyString(r.coverUrl) || (r.coverSource || "") === "default") {
                patch.coverUrl = DEFAULT_COVER_DATA_URL;
                patch.thumbnailUrl = DEFAULT_COVER_DATA_URL;
                patch.coverSource = "default";
                patch.coverUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
              } else {
                // cover var ama source/thumb eksik olabilir
                const defPatch = ensureDefaultCoverPatch(r);
                if (defPatch) Object.assign(patch, defPatch);
              }
            }
          }

          // patch boşsa atla
          if (Object.keys(patch).length) {
            await routeRef.set(patch, { merge: true });
            updated++;
          }
        } catch {
          errors++;
        }

        await new Promise((r) => setTimeout(r, 120));
      }

      if (snap.size < pageSize) break;
    }

    return { scanned, updated, errors };
  });
