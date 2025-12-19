// src/hooks/useUserRoutes.js
// Profil “Rotalarım” sekmesi için rota listesi hook’u
// EMİR 2 + EMİR 3: RouteCardMobile için standardize model (buildRouteCardModel).
// EMİR 10: Grid’e PREVIEW veri bind edilecek (stopsPreview/cover/thumbnail). Gerekirse HYDRATE (lazy fetch).

import { useCallback, useEffect, useRef, useState } from "react";
import { collection, query, orderBy, limit, startAfter, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { buildRouteCardModel, getOwnerIdFromRaw, getVisibilityKey } from "../routes/routeCardModel";

const DEFAULT_PAGE_SIZE = 20;

// ---------- helpers (preview binding + hydrate) ----------
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
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
  const candidates = [
    "title",
    "name",
    "label",
    "place.mainText",
    "place.name",
    "place.title",
    "place.formattedAddress",
    "place.formatted",
    "poi.name",
    "poi.title",
  ];
  const v = pickFirst(s, candidates);
  return typeof v === "string" ? v : "";
}

// ✅ patch: lat/lng yakalama alanlarını genişlet (GeoPoint / position / coordinates)
function extractStopLatLng(s) {
  if (!s || typeof s !== "object") return { lat: null, lng: null };

  const lat =
    pickFirst(s, [
      "lat",
      "latitude",
      "location.lat",
      "location.latitude",
      "position.lat",
      "position.latitude",
      "coords.lat",
      "coords.latitude",
      "coordinates.lat",
      "coordinates.latitude",
    ]) ?? null;

  const lng =
    pickFirst(s, [
      "lng",
      "lon",
      "longitude",
      "location.lng",
      "location.longitude",
      "position.lng",
      "position.longitude",
      "coords.lng",
      "coords.longitude",
      "coordinates.lng",
      "coordinates.longitude",
    ]) ?? null;

  const nlat = typeof lat === "number" ? lat : Number(lat);
  const nlng = typeof lng === "number" ? lng : Number(lng);

  return {
    lat: Number.isFinite(nlat) ? nlat : null,
    lng: Number.isFinite(nlng) ? nlng : null,
  };
}

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
    "url",
    "previewUrl",
    "previewURL",
  ]);
  if (isNonEmptyString(direct)) return String(direct).trim();

  const arr = pickFirst(s, ["media", "medias", "gallery", "items", "photos"]) || null;
  if (Array.isArray(arr) && arr.length) {
    for (const it of arr) {
      const u = pickFirst(it, ["url", "mediaUrl", "imageUrl", "thumbUrl"]);
      if (isNonEmptyString(u)) return String(u).trim();
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

  // order varsa sırala
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
    "preview.coverUrl",
    "preview.thumbnailUrl",
    "preview.url",
  ]);
  const coverUrl = isNonEmptyString(coverUrlVal) ? String(coverUrlVal).trim() : "";

  const thumbVal = pickFirst(raw, [
    "thumbnailUrl",
    "thumbUrl",
    "thumbURL",
    "preview.thumbnailUrl",
    "preview.thumbUrl",
    "previewUrl",
    "coverUrl",
  ]);
  const thumbnailUrl = isNonEmptyString(thumbVal) ? String(thumbVal).trim() : "";

  return { stopsPreview, coverUrl, thumbnailUrl };
}

function needsHydratePreview(route) {
  if (!route) return false;
  if (route.__previewHydrated) return false;

  const sp = route.stopsPreview;
  const hasStopsPreview = Array.isArray(sp) && sp.length >= 1;

  const cover =
    route.coverUrl ||
    route.previewUrl ||
    route.thumbnailUrl ||
    route.thumbUrl ||
    route.imageUrl ||
    route.photoUrl ||
    route.mediaUrl ||
    "";

  const hasCover = isNonEmptyString(cover);

  return !hasStopsPreview || !hasCover;
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // owner değişince hydrate cache sıfırla
  useEffect(() => {
    hydrateCacheRef.current = new Map();
    hydrateJobIdRef.current += 1;
  }, [ownerId]);

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
      } else {
        setLoadingMore(true);
      }

      const ownerKey = String(ownerId);
      const maxAutoPages = mode === "reset" ? 3 : 1;

      try {
        const colRef = collection(db, "routes");

        let localCursor = mode === "more" ? cursorRef.current : null;
        let collected = [];
        let localHasMore = false;
        let loops = 0;

        while (loops < maxAutoPages) {
          const constraints = [orderBy("createdAt", "desc")];
          if (localCursor) constraints.push(startAfter(localCursor));
          constraints.push(limit(pageSize + 1));

          const q = query(colRef, ...constraints);
          const snap = await getDocs(q);

          if (!isMountedRef.current || reqId !== requestIdRef.current) return;

          const docs = snap.docs || [];
          const pageDocs = docs.slice(0, pageSize);

          // ✅ cursor asla "extra doc" olmaz → atlama bug’ı yok
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

              const patched = {
                ...model,

                stopsPreview: Array.isArray(model?.stopsPreview) && model.stopsPreview.length ? model.stopsPreview : stopsPreview,

                coverUrl: isNonEmptyString(model?.coverUrl) ? model.coverUrl : coverUrl,
                thumbnailUrl: isNonEmptyString(model?.thumbnailUrl) ? model.thumbnailUrl : thumbnailUrl,

                previewUrl: isNonEmptyString(model?.previewUrl) ? model.previewUrl : (isNonEmptyString(coverUrl) ? coverUrl : model?.previewUrl) || "",
                thumbUrl: isNonEmptyString(model?.thumbUrl) ? model.thumbUrl : (isNonEmptyString(thumbnailUrl) ? thumbnailUrl : model?.thumbUrl) || "",
                imageUrl: isNonEmptyString(model?.imageUrl) ? model.imageUrl : (isNonEmptyString(coverUrl) ? coverUrl : model?.imageUrl) || "",
                mediaUrl: isNonEmptyString(model?.mediaUrl) ? model.mediaUrl : (isNonEmptyString(coverUrl) ? coverUrl : model?.mediaUrl) || "",

                raw: model?.raw && typeof model.raw === "object" ? model.raw : raw,
              };

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
    [ownerId, pageSize, isSelf, isFollowing, viewerId]
  );

  // ✅ EMİR 10 / Lazy HYDRATE: sadece start+end stop (2 query) + cover için ilk görseli dene
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

      // hala yoksa: küçük fallback
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
        const mediaUrl = extractStopMediaUrl(s);
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

      // cover: önce first stop media, yoksa last stop media
      let coverUrl = "";
      if (isNonEmptyString(firstStop?.mediaUrl)) coverUrl = String(firstStop.mediaUrl).trim();
      else if (isNonEmptyString(lastStop?.mediaUrl)) coverUrl = String(lastStop.mediaUrl).trim();

      const result = {
        stopsPreview,
        coverUrl,
        thumbnailUrl: coverUrl,
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

    const pump = async () => {
      if (cancelled) return;
      if (!isMountedRef.current) return;
      if (hydrateJobIdRef.current !== jobId) return;

      while (active < maxConc && idx < targets.length) {
        const r = targets[idx++];
        const rid = r?.id ? String(r.id) : null;
        if (!rid) continue;

        const cached = hydrateCacheRef.current.get(rid);
        if (cached?.status === "inflight" || cached?.status === "done") continue;

        active += 1;

        hydrateOneRoutePreview(rid, jobId)
          .then((patch) => {
            if (!patch) return;
            if (cancelled) return;
            if (!isMountedRef.current) return;
            if (hydrateJobIdRef.current !== jobId) return;

            setRoutes((prev) => {
              const next = (prev || []).map((x) => {
                if (!x || String(x.id) !== rid) return x;

                const existingCover = x.coverUrl || x.previewUrl || x.thumbnailUrl || x.thumbUrl || x.imageUrl || x.mediaUrl || "";

                const nextCover = isNonEmptyString(existingCover) ? existingCover : isNonEmptyString(patch.coverUrl) ? patch.coverUrl : "";

                const nextStopsPreview =
                  Array.isArray(x.stopsPreview) && x.stopsPreview.length ? x.stopsPreview : Array.isArray(patch.stopsPreview) ? patch.stopsPreview : [];

                const changed =
                  ((!Array.isArray(x.stopsPreview) || x.stopsPreview.length === 0) && nextStopsPreview.length > 0) ||
                  (!isNonEmptyString(existingCover) && isNonEmptyString(nextCover));

                if (!changed) return { ...x, __previewHydrated: true };

                return {
                  ...x,
                  stopsPreview: nextStopsPreview,
                  coverUrl: isNonEmptyString(x.coverUrl) ? x.coverUrl : nextCover,
                  previewUrl: isNonEmptyString(x.previewUrl) ? x.previewUrl : nextCover,
                  thumbnailUrl: isNonEmptyString(x.thumbnailUrl) ? x.thumbnailUrl : nextCover,
                  thumbUrl: isNonEmptyString(x.thumbUrl) ? x.thumbUrl : nextCover,
                  imageUrl: isNonEmptyString(x.imageUrl) ? x.imageUrl : nextCover,
                  mediaUrl: isNonEmptyString(x.mediaUrl) ? x.mediaUrl : nextCover,
                  __previewHydrated: true,
                };
              });
              return next;
            });
          })
          .finally(() => {
            active -= 1;
            pump();
          });
      }
    };

    pump();

    return () => {
      cancelled = true;
    };
  }, [routes, hydrateOneRoutePreview]);

  const reload = useCallback(() => {
    loadPage("reset");
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || initialLoading) return;
    loadPage("more");
  }, [hasMore, loadingMore, initialLoading, loadPage]);

  // ✅ boş mesaj sadece gerçekten “bitti” ise
  const isEmpty = !initialLoading && routes.length === 0 && !hasMore;

  return {
    routes,
    loading: initialLoading,
    loadingMore,
    hasMore,
    error,
    reload,
    loadMore,
    isEmpty,
  };
}
