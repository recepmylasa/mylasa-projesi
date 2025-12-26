// src/hooks/useUserRoutes.js
// Profil “Rotalarım” sekmesi için rota listesi hook’u
// RouteCardMobile için standardize model (buildRouteCardModel).
// Grid’e PREVIEW veri bind edilecek (stopsPreview/cover/thumbnail). Gerekirse HYDRATE (lazy fetch).
//
// EMİR-1 notu (grid/read):
// - stopsPreview içinden "coverUrl" türetip modele yazma YOK (sadece gösterimde kullanılacak).
// - Yani coverUrl/thumbnailUrl yalnızca doc/model legacy alanlardan gelirse doldurulur.
// - Fallback (ilk durak görseli) UI tarafında pickCoverCandidate ile yapılır.
//
// EMİR-1.2 (tek kaynak / UI):
// - Model her rotada route.cover.url üretsin (manual varsa onu, yoksa legacy/stopMedia/default).
// - DB'ye yazım YOK (sadece view-model).

import { useCallback, useEffect, useRef, useState } from "react";
import { collection, query, orderBy, limit, startAfter, getDocs, where } from "firebase/firestore";
import { db } from "../firebase";
import { buildRouteCardModel, getOwnerIdFromRaw, getVisibilityKey } from "../routes/routeCardModel";

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_ROUTE_COVER_URL = "/route-default-cover.jpg";

// ---------- helpers (preview binding + hydrate) ----------
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function stripQueryAndHash(v) {
  const s = (v || "").toString().trim();
  if (!s) return "";
  return s.split(/[?#]/)[0];
}

function isKnownAppLogoUrl(v) {
  const base = stripQueryAndHash(v).toLowerCase();
  if (!base) return false;
  const file = base.split("/").pop();
  return file === "mylasa-logo.png" || file === "mylasa-logo.svg";
}

function normalizeCoverUrl(v) {
  if (!isNonEmptyString(v)) return "";
  const s = String(v).trim();
  return isKnownAppLogoUrl(s) ? "" : s;
}

function isVideoUrl(url) {
  const u = (url || "").toString().toLowerCase();
  return u.includes(".mp4") || u.includes(".webm") || u.includes(".mov") || u.includes(".m4v") || u.includes("video/");
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function pickFirst(obj, paths) {
  for (const p of paths || []) {
    const v = p.includes(".") ? getByPath(obj, p) : obj?.[p];
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      if (isNonEmptyString(v)) return v.trim();
      continue;
    }
    return v;
  }
  return undefined;
}

function normalizeStopTitle(s) {
  if (!s) return "";
  if (typeof s === "string") return s;
  const candidates = ["title", "name", "label", "place.mainText", "place.name", "place.title", "place.formattedAddress", "place.formatted", "poi.name", "poi.title"];
  const v = pickFirst(s, candidates);
  return typeof v === "string" ? v : "";
}

// ✅ patch: lat/lng yakalama alanlarını genişlet (GeoPoint / position / coordinates)
function extractStopLatLng(s) {
  if (!s || typeof s !== "object") return { lat: null, lng: null };

  const lat =
    pickFirst(s, ["lat", "latitude", "location.lat", "location.latitude", "position.lat", "position.latitude", "coords.lat", "coords.latitude", "coordinates.lat", "coordinates.latitude"]) ?? null;

  const lng =
    pickFirst(s, ["lng", "lon", "longitude", "location.lng", "location.longitude", "position.lng", "position.longitude", "coords.lng", "coords.longitude", "coordinates.lng", "coordinates.longitude"]) ?? null;

  const nlat = typeof lat === "number" ? lat : Number(lat);
  const nlng = typeof lng === "number" ? lng : Number(lng);

  return {
    lat: Number.isFinite(nlat) ? nlat : null,
    lng: Number.isFinite(nlng) ? nlng : null,
  };
}

// ✅ patch: stop içindeki medya url alanlarını genişlet (downloadUrl vb.)
function extractStopMediaUrl(s) {
  if (!s) return "";

  const direct = pickFirst(s, [
    "mediaUrl",
    "mediaURL",
    "imageUrl",
    "imageURL",
    "photoUrl",
    "photoURL",
    "thumbUrl",
    "thumbnailUrl",
    "coverUrl",
    "coverURL",
    "previewUrl",
    "previewURL",
    "posterUrl",
    "poster",
    "downloadUrl",
    "downloadURL",
    "signedUrl",
    "publicUrl",
    "fileUrl",
    "uri",
    "path",
    "fullPath",
    "storagePath",
    "gsUrl",
    "gsURL",
    "url",
    "src",
  ]);
  if (isNonEmptyString(direct)) return String(direct).trim();

  const arr =
    pickFirst(s, ["media", "medias", "gallery", "items", "photos", "images", "imageUrls", "photoUrls", "mediaItems", "attachments", "files"]) || null;

  if (Array.isArray(arr) && arr.length) {
    for (const it of arr) {
      if (!it) continue;
      if (typeof it === "string" && it.trim()) return it.trim();

      const u = pickFirst(it, [
        "url",
        "src",
        "mediaUrl",
        "imageUrl",
        "photoUrl",
        "thumbUrl",
        "thumbnailUrl",
        "previewUrl",
        "posterUrl",
        "poster",
        "downloadUrl",
        "downloadURL",
        "signedUrl",
        "publicUrl",
        "fileUrl",
        "uri",
        "path",
        "fullPath",
        "storagePath",
        "gsUrl",
      ]);
      if (isNonEmptyString(u)) return String(u).trim();

      const nested = pickFirst(it, ["file.url", "file.downloadUrl", "file.downloadURL", "file.path", "asset.url", "asset.downloadUrl", "asset.downloadURL"]);
      if (isNonEmptyString(nested)) return String(nested).trim();
    }
  }

  return "";
}

function normalizeStopsPreviewValue(v) {
  if (!v) return [];
  let arr = [];
  if (Array.isArray(v)) arr = v.slice();
  else if (typeof v === "object") {
    const inner = pickFirst(v, ["items", "stops", "preview", "list"]);
    if (Array.isArray(inner)) arr = inner.slice();
  }

  const cleaned = arr
    .map((s) => {
      if (!s) return null;
      if (typeof s === "string") {
        const t = s.trim();
        if (!t) return null;
        return { title: t };
      }
      if (typeof s === "object") {
        const title = normalizeStopTitle(s);
        const { lat, lng } = extractStopLatLng(s);
        const mediaUrl = extractStopMediaUrl(s);
        const out = {};
        if (isNonEmptyString(title)) out.title = title;
        if (lat !== null) out.lat = lat;
        if (lng !== null) out.lng = lng;
        if (isNonEmptyString(mediaUrl)) out.mediaUrl = mediaUrl;
        if (s.id) out.id = s.id;
        if (s.order !== undefined) out.order = s.order;
        if (s.idx !== undefined && out.order === undefined) out.order = s.idx;
        return Object.keys(out).length ? out : null;
      }
      return null;
    })
    .filter(Boolean);

  const sorted = cleaned.slice().sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : Number(a.order);
    const bo = typeof b.order === "number" ? b.order : Number(b.order);
    const na = Number.isFinite(ao) ? ao : 0;
    const nb = Number.isFinite(bo) ? bo : 0;
    return na - nb;
  });

  if (sorted.length > 2) return [sorted[0], sorted[sorted.length - 1]];
  return sorted;
}

function extractPreviewFromRouteDoc(raw) {
  if (!raw || typeof raw !== "object") {
    return { stopsPreview: [], coverUrl: "", thumbnailUrl: "" };
  }

  const stopsPreviewRaw = pickFirst(raw, [
    "stopsPreview",
    "stops_preview",
    "previewStops",
    "stopsLite",
    "stopsLitePreview",
    "stopsShort",
    "preview.stops",
    "preview.stopsPreview",
    "preview.items",
    "stops",
  ]);

  const stopsPreview = normalizeStopsPreviewValue(stopsPreviewRaw);

  const coverUrlVal = pickFirst(raw, [
    "coverUrl",
    "coverURL",
    "coverPhotoUrl",
    "coverImageUrl",
    "previewUrl",
    "previewURL",
    "thumbnailUrl",
    "thumbUrl",
    "imageUrl",
    "photoUrl",
    "mediaUrl",
    "downloadUrl",
    "downloadURL",
    "preview.coverUrl",
    "preview.thumbnailUrl",
    "preview.url",
  ]);

  let coverUrl = normalizeCoverUrl(coverUrlVal);
  if (coverUrl && isVideoUrl(coverUrl)) coverUrl = ""; // ✅ video cover yasak

  const thumbVal = pickFirst(raw, ["thumbnailUrl", "thumbUrl", "thumbURL", "preview.thumbnailUrl", "preview.thumbUrl", "previewUrl", "coverUrl", "downloadUrl", "downloadURL"]);
  let thumbnailUrl = normalizeCoverUrl(thumbVal);
  if (thumbnailUrl && isVideoUrl(thumbnailUrl)) thumbnailUrl = "";

  // ✅ EMİR-1: coverUrl'ü stopsPreview’den TÜRETME (write yok). UI fallback yapacak.
  if (!isNonEmptyString(thumbnailUrl)) {
    thumbnailUrl = coverUrl || "";
  }

  return { stopsPreview, coverUrl, thumbnailUrl };
}

// -------- cover canonicalizer (EMİR-1.2) --------
function normalizeCandidate(u) {
  const s = normalizeCoverUrl(u);
  if (!s) return "";
  if (isVideoUrl(s)) return "";
  return s;
}

function pickStopCoverCandidateFromStops(stops) {
  const arr = Array.isArray(stops) ? stops : [];
  for (const st of arr) {
    if (!st) continue;

    const stopId = isNonEmptyString(st?.id) ? String(st.id) : isNonEmptyString(st?.stopId) ? String(st.stopId) : "";

    // video hint
    const videoHint =
      isVideoUrl(st?.videoUrl) ||
      isVideoUrl(st?.mediaUrl) ||
      isVideoUrl(st?.url) ||
      isVideoUrl(st?.src) ||
      ((st?.type || st?.mediaType || st?.kind || st?.mime || "").toString().toLowerCase().includes("video"));

    // poster candidates (prefer if videoHint)
    const poster = normalizeCandidate(
      st?.posterUrl || st?.poster || st?.thumbnailUrl || st?.thumbUrl || st?.previewUrl || st?.previewURL || ""
    );
    if (poster && videoHint) {
      return { url: poster, stopId, fromVideoPoster: true, sourceField: "stopMedia.poster" };
    }

    // image candidates
    const img = normalizeCandidate(
      st?.imageUrl ||
        st?.photoUrl ||
        st?.thumbnailUrl ||
        st?.thumbUrl ||
        st?.previewUrl ||
        st?.coverUrl ||
        st?.mediaUrl ||
        st?.downloadUrl ||
        st?.downloadURL ||
        st?.publicUrl ||
        st?.signedUrl ||
        st?.fileUrl ||
        st?.uri ||
        st?.path ||
        st?.fullPath ||
        st?.storagePath ||
        st?.gsUrl ||
        st?.url ||
        st?.src ||
        ""
    );
    if (img) {
      return { url: img, stopId, fromVideoPoster: false, sourceField: "stopMedia.image" };
    }

    // arrays (media/gallery/etc)
    const packs = [st.media, st.medias, st.gallery, st.items, st.photos, st.images, st.attachments, st.files, st.mediaItems].filter(Boolean);
    for (const p of packs) {
      const list = Array.isArray(p) ? p : null;
      if (!list || !list.length) continue;

      for (const it of list) {
        if (!it) continue;
        if (typeof it === "string") {
          const u = normalizeCandidate(it);
          if (u) return { url: u, stopId, fromVideoPoster: false, sourceField: "stopMedia.image" };
          continue;
        }
        if (typeof it === "object") {
          const typeRaw = (it.type || it.mediaType || it.kind || it.mime || "").toString().toLowerCase();
          const isVid = typeRaw.includes("video") || isVideoUrl(it.url) || isVideoUrl(it.videoUrl);

          const poster2 = normalizeCandidate(it.posterUrl || it.poster || it.thumbnailUrl || it.thumbUrl || it.previewUrl || "");
          if (isVid && poster2) return { url: poster2, stopId, fromVideoPoster: true, sourceField: "stopMedia.poster" };

          const u2 = normalizeCandidate(it.url || it.src || it.mediaUrl || it.imageUrl || it.photoUrl || it.downloadUrl || it.publicUrl || it.path || it.uri || "");
          if (!isVid && u2) return { url: u2, stopId, fromVideoPoster: false, sourceField: "stopMedia.image" };
        }
      }
    }
  }
  return { url: "", stopId: "", fromVideoPoster: false, sourceField: "" };
}

function buildCanonicalCoverForUi(routeLike, raw) {
  const r = routeLike || {};
  const rawCover = r?.cover && typeof r.cover === "object" ? r.cover : raw?.cover && typeof raw.cover === "object" ? raw.cover : null;

  const manual = normalizeCandidate(rawCover?.url);
  if (manual) {
    return {
      ...(rawCover || {}),
      url: manual,
      kind: "image",
      source: rawCover?.source === "auto" ? "auto" : "manual",
      sourceField: rawCover?.sourceField || "cover.url",
      fromVideoPoster: false,
    };
  }

  const legacyList = [
    r.coverUrl,
    r.coverPhotoUrl,
    r.coverImageUrl,
    r.previewUrl,
    r.previewURL,
    r.thumbnailUrl,
    r.thumbUrl,
    r.imageUrl,
    r.photoUrl,
    r.mediaUrl,
    raw?.coverUrl,
    raw?.coverPhotoUrl,
    raw?.coverImageUrl,
    raw?.previewUrl,
    raw?.thumbnailUrl,
    raw?.mediaUrl,
  ];

  for (const v of legacyList) {
    const u = normalizeCandidate(v);
    if (u) {
      return {
        url: u,
        kind: "image",
        source: "auto",
        sourceField: "legacy",
        fromVideoPoster: false,
      };
    }
  }

  const stops = Array.isArray(r?.stopsPreview) ? r.stopsPreview : Array.isArray(raw?.stopsPreview) ? raw.stopsPreview : Array.isArray(r?.stops) ? r.stops : Array.isArray(raw?.stops) ? raw.stops : [];
  const stopPick = pickStopCoverCandidateFromStops(stops);
  if (stopPick?.url) {
    return {
      url: stopPick.url,
      kind: "image",
      source: "auto",
      sourceField: stopPick.sourceField || "stopMedia",
      fromVideoPoster: !!stopPick.fromVideoPoster,
      stopId: stopPick.stopId || "",
    };
  }

  return {
    url: DEFAULT_ROUTE_COVER_URL,
    kind: "image",
    source: "auto",
    sourceField: "default",
    fromVideoPoster: false,
  };
}

function needsHydratePreview(route) {
  if (!route) return false;
  if (route.__previewHydrated) return false;

  const sp = route.stopsPreview;
  const hasStopsPreview = Array.isArray(sp) && sp.length >= 1;

  const coverFromCanonical = normalizeCoverUrl(route?.cover?.url);
  const isPlaceholderCover = coverFromCanonical === DEFAULT_ROUTE_COVER_URL || stripQueryAndHash(coverFromCanonical).endsWith("/route-default-cover.jpg");

  const coverLegacyRaw =
    route.coverUrl || route.previewUrl || route.thumbnailUrl || route.thumbUrl || route.imageUrl || route.photoUrl || route.mediaUrl || "";

  const coverLegacy = normalizeCoverUrl(coverLegacyRaw);
  const isPlaceholderLegacy = coverLegacy === DEFAULT_ROUTE_COVER_URL || stripQueryAndHash(coverLegacy).endsWith("/route-default-cover.jpg");

  const hasCover = (!!coverFromCanonical && !isPlaceholderCover) || (!!coverLegacy && !isPlaceholderLegacy);

  // ✅ cover placeholder ise hydrate’e izin ver (stop'larda gerçek medya olabilir)
  return !hasStopsPreview || !hasCover;
}

// ✅ Create-index linkini GİZLEME: detaylı log helper
function logFirestoreQueryError(tag, err) {
  const code = err?.code ? String(err.code) : "unknown";
  const message = err?.message ? String(err.message) : "";
  const stack = err?.stack ? String(err.stack) : "";

  // eslint-disable-next-line no-console
  console.groupCollapsed(`${tag} (${code})`);
  // eslint-disable-next-line no-console
  console.error(err);
  // eslint-disable-next-line no-console
  console.log("err.code:", code);
  // eslint-disable-next-line no-console
  console.log("err.message:", message);
  if (stack) {
    // eslint-disable-next-line no-console
    console.log("err.stack:", stack);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();

  if (message) {
    // eslint-disable-next-line no-console
    console.warn(`${tag} message:`, message);
  }
}

export default function useUserRoutes(ownerId, options = {}) {
  const { pageSize = DEFAULT_PAGE_SIZE, isSelf = false, isFollowing = false, viewerId = null } = options;

  const [routes, setRoutes] = useState([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const cursorRef = useRef(null);
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  // HYDRATE cache + job guard
  const hydrateCacheRef = useRef(new Map()); // routeId -> { status: "inflight"|"done" }
  const hydrateJobIdRef = useRef(0);

  // ✅ query mode: optimized(ownerId+status) vs legacy
  const queryModeRef = useRef("unknown"); // "unknown" | "optimized" | "legacy"

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // owner değişince hydrate cache + query mode sıfırla
  useEffect(() => {
    hydrateCacheRef.current = new Map();
    hydrateJobIdRef.current += 1;
    queryModeRef.current = "unknown";
  }, [ownerId]);

  const runQueryPage = useCallback(
    async ({ ownerKey, localCursor, modeToUse }) => {
      const colRef = collection(db, "routes");

      const mkOptimized = () => {
        const constraints = [where("ownerId", "==", ownerKey), where("status", "==", "finished"), orderBy("createdAt", "desc")];
        if (localCursor) constraints.push(startAfter(localCursor));
        constraints.push(limit(pageSize + 1));
        return query(colRef, ...constraints);
      };

      const mkLegacy = () => {
        const constraints = [orderBy("createdAt", "desc")];
        if (localCursor) constraints.push(startAfter(localCursor));
        constraints.push(limit(pageSize + 1));
        return query(colRef, ...constraints);
      };

      if (modeToUse === "legacy") {
        const snap = await getDocs(mkLegacy());
        return { snap, used: "legacy" };
      }

      try {
        const snap = await getDocs(mkOptimized());
        return { snap, used: "optimized" };
      } catch (e) {
        logFirestoreQueryError("[useUserRoutes] optimized query failed", e);

        try {
          const snap = await getDocs(mkLegacy());
          return { snap, used: "legacy" };
        } catch (e2) {
          logFirestoreQueryError("[useUserRoutes] legacy fallback failed", e2);
          throw e2;
        }
      }
    },
    [pageSize]
  );

  const loadPage = useCallback(
    async (mode = "reset") => {
      if (!ownerId || !db) {
        if (mode === "reset") {
          setRoutes([]);
          setHasMore(false);
          setError(null);
          setInitialLoading(false);
          setLoadingMore(false);
        }
        return;
      }

      const reqId = ++requestIdRef.current;

      if (mode === "reset") {
        setInitialLoading(true);
        setLoadingMore(false);
        setError(null);
        cursorRef.current = null;
        setHasMore(false);
        setRoutes([]);

        hydrateCacheRef.current = new Map();
        hydrateJobIdRef.current += 1;

        queryModeRef.current = "unknown";
      } else {
        setLoadingMore(true);
      }

      const ownerKey = String(ownerId);
      const maxAutoPages = mode === "reset" ? 3 : 1;

      try {
        let localCursor = mode === "more" ? cursorRef.current : null;
        let collected = [];
        let localHasMore = false;
        let loops = 0;

        while (loops < maxAutoPages) {
          const currentMode =
            mode === "reset"
              ? queryModeRef.current === "unknown"
                ? "optimized"
                : queryModeRef.current
              : queryModeRef.current === "unknown"
              ? "legacy"
              : queryModeRef.current;

          const { snap, used } = await runQueryPage({ ownerKey, localCursor, modeToUse: currentMode });

          if (!isMountedRef.current || reqId !== requestIdRef.current) return;

          const docs = snap.docs || [];
          const pageDocs = docs.slice(0, pageSize);

          if (mode === "reset" && queryModeRef.current === "unknown" && used === "optimized" && docs.length === 0) {
            const legacyRes = await runQueryPage({ ownerKey, localCursor: null, modeToUse: "legacy" });
            const legacyDocs = legacyRes.snap.docs || [];
            if (legacyDocs.length > 0) queryModeRef.current = "legacy";
          } else if (mode === "reset" && queryModeRef.current === "unknown") {
            queryModeRef.current = used;
          }

          const nextCursor = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
          localHasMore = docs.length > pageSize;

          const mapped = pageDocs
            .map((d) => {
              const raw = d.data() || {};

              const docOwnerId = getOwnerIdFromRaw(raw, ownerKey);
              const docOwnerKey = docOwnerId ? String(docOwnerId) : "";
              if (!docOwnerKey || docOwnerKey !== ownerKey) return null;

              const deleted = raw.deleted === true || !!raw.deletedAt || !!raw.isDeleted || !!raw.archivedAt;
              if (deleted) return null;

              const status = (raw.status || "").toString().toLowerCase();
              if (status && status !== "finished") return null;

              const visibilityKey = getVisibilityKey(raw);

              if (!isSelf) {
                if (visibilityKey === "private") return null;
                if (!isFollowing && visibilityKey === "followers") return null;
                if (visibilityKey === "unknown") return null;
              }

              const model = buildRouteCardModel({
                id: d.id,
                raw,
                ownerIdFallback: docOwnerKey,
                viewerId,
              });

              const { stopsPreview, coverUrl, thumbnailUrl } = extractPreviewFromRouteDoc(raw);

              // ✅ placeholder cover'ları yok say
              const modelCover = normalizeCoverUrl(model?.coverUrl);
              const modelPreview = normalizeCoverUrl(model?.previewUrl);
              const modelThumb = normalizeCoverUrl(model?.thumbnailUrl);
              const modelThumb2 = normalizeCoverUrl(model?.thumbUrl);
              const modelImage = normalizeCoverUrl(model?.imageUrl);
              const modelMedia = normalizeCoverUrl(model?.mediaUrl);

              const docCover = normalizeCoverUrl(coverUrl);
              const docThumb = normalizeCoverUrl(thumbnailUrl);

              // ✅ EMİR-1: stopsPreview media’dan coverUrl türetme YOK
              const finalCoverRaw = modelCover || modelPreview || modelImage || modelMedia || docCover || "";
              const finalCover = finalCoverRaw && !isVideoUrl(finalCoverRaw) ? finalCoverRaw : "";

              const finalThumbRaw = modelThumb || modelThumb2 || docThumb || finalCover || "";
              const finalThumb = finalThumbRaw && !isVideoUrl(finalThumbRaw) ? finalThumbRaw : "";

              const patched = {
                ...model,

                stopsPreview: Array.isArray(model?.stopsPreview) && model.stopsPreview.length ? model.stopsPreview : stopsPreview,

                // legacy compat (doc/model varsa doldur)
                coverUrl: finalCover,
                thumbnailUrl: finalThumb,

                previewUrl: modelPreview || finalCover || "",
                thumbUrl: modelThumb2 || finalThumb || "",
                imageUrl: modelImage || finalCover || "",
                mediaUrl: modelMedia || finalCover || "",

                raw: model?.raw && typeof model.raw === "object" ? model.raw : raw,
              };

              // ✅ EMİR-1.2: canonical cover her zaman dolu olsun (view-model)
              const cover = buildCanonicalCoverForUi(patched, raw);
              patched.cover = cover;

              return patched;
            })
            .filter(Boolean);

          collected = mode === "reset" ? collected.concat(mapped) : mapped;

          localCursor = nextCursor;

          if (mode === "reset") {
            if (collected.length > 0) break;
            if (!localHasMore || !localCursor) break;
            loops += 1;
            continue;
          }

          break;
        }

        if (!isMountedRef.current || reqId !== requestIdRef.current) return;

        setRoutes((prev) => (mode === "reset" ? collected : prev.concat(collected)));
        cursorRef.current = localCursor;
        setHasMore(!!(localHasMore && localCursor));
      } catch (err) {
        if (!isMountedRef.current || reqId !== requestIdRef.current) return;

        // eslint-disable-next-line no-console
        console.warn("[useUserRoutes] load error", err);
        if (mode === "reset") setRoutes([]);
        setHasMore(false);
        setError(err || new Error("Rotalar yüklenirken bir hata oluştu."));
      } finally {
        if (!isMountedRef.current || reqId !== requestIdRef.current) return;
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [ownerId, pageSize, isSelf, isFollowing, viewerId, runQueryPage]
  );

  // ✅ Lazy HYDRATE: sadece start+end stop (2 query) + stopsPreview'u besle
  const hydrateOneRoutePreview = useCallback(async (routeId, jobId) => {
    if (!routeId || !db) return null;
    if (!isMountedRef.current) return null;
    if (hydrateJobIdRef.current !== jobId) return null;

    const rid = String(routeId);
    const cached = hydrateCacheRef.current.get(rid);
    if (cached?.status === "inflight" || cached?.status === "done") return null;

    hydrateCacheRef.current.set(rid, { status: "inflight" });

    const stopsCol = collection(db, "routes", rid, "stops");

    const fetchOne = async (field, dir) => {
      try {
        const snap = await getDocs(query(stopsCol, orderBy(field, dir), limit(1)));
        return snap.docs?.[0] || null;
      } catch {
        return null;
      }
    };

    try {
      let firstDoc = await fetchOne("order", "asc");
      let lastDoc = await fetchOne("order", "desc");

      if (!firstDoc || !lastDoc) {
        const f2 = await fetchOne("idx", "asc");
        const l2 = await fetchOne("idx", "desc");
        firstDoc = firstDoc || f2;
        lastDoc = lastDoc || l2;
      }

      if (!firstDoc && !lastDoc) {
        const snap = await getDocs(query(stopsCol, limit(2)));
        const docs = snap.docs || [];
        firstDoc = docs[0] || null;
        lastDoc = docs.length > 1 ? docs[docs.length - 1] : docs[0] || null;
      }

      if (!isMountedRef.current) return null;
      if (hydrateJobIdRef.current !== jobId) return null;

      const makeStop = (sd) => {
        if (!sd) return null;
        const s = { id: sd.id, ...(sd.data() || {}) };
        const title = normalizeStopTitle(s);
        const { lat, lng } = extractStopLatLng(s);

        const mediaUrlRaw = extractStopMediaUrl(s);
        const mediaUrl = isNonEmptyString(mediaUrlRaw) ? String(mediaUrlRaw).trim() : "";

        const out = { id: s.id };
        if (isNonEmptyString(title)) out.title = title;
        if (lat !== null) out.lat = lat;
        if (lng !== null) out.lng = lng;
        if (isNonEmptyString(mediaUrl)) out.mediaUrl = mediaUrl;
        if (s.order !== undefined) out.order = s.order;
        if (s.idx !== undefined && out.order === undefined) out.order = s.idx;
        return Object.keys(out).length > 1 ? out : null;
      };

      const firstStop = makeStop(firstDoc);
      const lastStop = makeStop(lastDoc);

      let stopsPreview = [];
      if (firstStop) stopsPreview.push(firstStop);
      if (lastStop && (!firstStop || String(lastStop.id) !== String(firstStop.id))) stopsPreview.push(lastStop);

      const result = {
        stopsPreview,
        // ✅ EMİR-1: hydrate coverUrl yazma yok; canonical cover re-evaluate edilecek
        coverUrl: "",
        thumbnailUrl: "",
      };

      hydrateCacheRef.current.set(rid, { status: "done" });
      return result;
    } catch {
      hydrateCacheRef.current.set(rid, { status: "done" });
      return null;
    }
  }, []);

  useEffect(() => {
    if (!ownerId) {
      setRoutes([]);
      setHasMore(false);
      setError(null);
      setInitialLoading(false);
      setLoadingMore(false);
      return;
    }
    loadPage("reset");
  }, [ownerId, isSelf, isFollowing, loadPage]);

  // ✅ Lazy hydrate runner (max 3 concurrent)
  useEffect(() => {
    if (!routes || routes.length === 0) return;
    const jobId = hydrateJobIdRef.current;

    const targets = routes.filter((r) => needsHydratePreview(r)).slice(0, 24);
    if (!targets.length) return;

    let cancelled = false;
    let idx = 0;
    let active = 0;
    const maxConc = 3;

    function canRun() {
      if (cancelled) return false;
      if (!isMountedRef.current) return false;
      if (hydrateJobIdRef.current !== jobId) return false;
      return true;
    }

    function applyPatchToRoute(rid, patch) {
      setRoutes((prev) => {
        const next = (prev || []).map((x) => {
          if (!x || String(x.id) !== rid) return x;

          const nextStopsPreview =
            Array.isArray(x.stopsPreview) && x.stopsPreview.length ? x.stopsPreview : Array.isArray(patch.stopsPreview) ? patch.stopsPreview : [];

          const changed = ((!Array.isArray(x.stopsPreview) || x.stopsPreview.length === 0) && nextStopsPreview.length > 0);

          const nextObj = {
            ...x,
            stopsPreview: nextStopsPreview,
            __previewHydrated: true,
          };

          // ✅ stopsPreview geldiyse cover tekrar değerlendir (placeholder’dan kurtar)
          nextObj.cover = buildCanonicalCoverForUi(nextObj, nextObj.raw || null);

          return changed ? nextObj : nextObj;
        });
        return next;
      });
    }

    function pump() {
      if (!canRun()) return;

      while (active < maxConc && idx < targets.length) {
        const r = targets[idx++];
        const rid = r?.id ? String(r.id) : null;
        if (!rid) continue;

        const cached = hydrateCacheRef.current.get(rid);
        if (cached?.status === "inflight" || cached?.status === "done") continue;

        startTask(rid);
      }
    }

    function startTask(rid) {
      active += 1;

      hydrateOneRoutePreview(rid, jobId)
        .then((patch) => {
          if (!patch) return;
          if (!canRun()) return;
          applyPatchToRoute(rid, patch);
        })
        .catch(() => {
          // no-op
        })
        .finally(() => {
          active -= 1;
          if (canRun()) pump();
        });
    }

    pump();

    return () => {
      cancelled = true;
    };
  }, [routes, hydrateOneRoutePreview]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || initialLoading) return;
    loadPage("more");
  }, [hasMore, loadingMore, initialLoading, loadPage]);

  const isEmpty = !initialLoading && routes.length === 0 && !hasMore;

  return {
    routes,
    loading: initialLoading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    isEmpty,
  };
}
