// src/hooks/useUserRoutes.js
// Profil “Rotalarım” sekmesi için rota listesi hook’u
// EMİR 2 + EMİR 3: RouteCardMobile için standardize model (buildRouteCardModel).
// EMİR 10: Grid’e PREVIEW veri bind edilecek (stopsPreview/cover/thumbnail). Gerekirse HYDRATE (lazy fetch).

import { useCallback, useEffect, useRef, useState } from "react";
import { collection, query, orderBy, limit, startAfter, getDocs } from "firebase/firestore";
import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";
import { db } from "../firebase";
import {
  buildRouteCardModel,
  getOwnerIdFromRaw,
  getVisibilityKey,
  pickCover,
  isLikelyStorageReference,
  isRenderableHttpsUrl,
} from "../routes/routeCardModel";

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

  // RouteDetail'e olabildiğince yakın + geriye dönük tolerans
  const candidates = [
    "title",
    "name",
    "label",
    "mainText",
    "place.mainText",
    "place.description",
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

function extractStopLatLng(s) {
  if (!s || typeof s !== "object") return { lat: null, lng: null };
  const lat = pickFirst(s, ["lat", "latitude", "location.lat", "position.lat"]) ?? null;
  const lng =
    pickFirst(s, ["lng", "lon", "longitude", "location.lng", "position.lng"]) ?? null;
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
    "path",
    "uri",
  ]);
  if (isNonEmptyString(direct)) return String(direct).trim();

  const arr = pickFirst(s, ["media", "medias", "gallery", "items", "photos"]) || null;
  if (Array.isArray(arr) && arr.length) {
    for (const it of arr) {
      const u = pickFirst(it, ["url", "mediaUrl", "imageUrl", "thumbUrl", "path", "uri"]);
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
        return Object.keys(out).length ? out : null;
      }
      return null;
    })
    .filter(Boolean);

  // grid için sadece ilk + son
  if (cleaned.length > 2) {
    return [cleaned[0], cleaned[cleaned.length - 1]];
  }
  return cleaned;
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
    // DİKKAT: routes/{id} dokümanında "stops" varsa bile çok farklı olabilir;
    // yine de tolerans
    "stops",
  ]);

  const stopsPreview = normalizeStopsPreviewValue(stopsPreviewRaw);

  const coverUrlVal = pickFirst(raw, [
    "coverUrl",
    "coverURL",
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
  const hasStopsPreview = Array.isArray(sp) && sp.length >= 2; // Start➜End için 2 şart

  // Cover: pickCover sonucu render edilebilir https değilse (gs://, path, tokenless storage vb.) hydrate/resolver gerekir
  const pc = pickCover(route);
  const candidateUrl = pc?.url || "";
  const hasRenderableCover = isRenderableHttpsUrl(candidateUrl);

  return !hasStopsPreview || !hasRenderableCover;
}

function pickCoverCandidateUrl(route, fallbackStopsPreview) {
  const r = route || {};
  const candidates = [
    r.coverHttps,
    r.coverUrl,
    r.previewUrl,
    r.thumbnailUrl,
    r.mediaUrl,
    r.thumbUrl,
    r.imageUrl,
    r.photoUrl,
    r.raw?.coverUrl,
    r.raw?.previewUrl,
    r.raw?.thumbnailUrl,
    r.raw?.mediaUrl,
    r.raw?.thumbUrl,
    r.raw?.imageUrl,
    r.raw?.photoUrl,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => !!x);

  if (candidates.length) return candidates[0];

  const sp = Array.isArray(fallbackStopsPreview) ? fallbackStopsPreview : [];
  for (const s of sp) {
    const u = typeof s?.mediaUrl === "string" ? s.mediaUrl.trim() : "";
    if (u) return u;
  }
  return "";
}

async function resolveMediaToHttps(urlOrPath, cacheRef) {
  const input = typeof urlOrPath === "string" ? urlOrPath.trim() : "";
  if (!input) return "";

  // ✅ render edilebilir https ise direkt kullan
  if (isRenderableHttpsUrl(input)) return input;

  // ✅ storage referansı değilse resolver denemek anlamsız (grid placeholder kalsın)
  if (!isLikelyStorageReference(input)) return "";

  // ✅ cache (aynı input için 1 kere)
  const cached = cacheRef.current.get(input);
  if (cached) {
    try {
      const r = await cached;
      return typeof r === "string" ? r : "";
    } catch {
      return "";
    }
  }

  const p = (async () => {
    try {
      const st = getStorage();
      const dl = await getDownloadURL(storageRef(st, input));
      if (typeof dl === "string" && dl.startsWith("https://")) return dl;
      return "";
    } catch {
      return "";
    }
  })();

  cacheRef.current.set(input, p);

  try {
    const res = await p;
    return typeof res === "string" ? res : "";
  } catch {
    return "";
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

  // HYDRATE cache + job guard (routeId bazlı: tek sefer)
  const hydrateCacheRef = useRef(new Map()); // routeId -> { status: "inflight"|"done" }
  const hydrateJobIdRef = useRef(0);

  // resolver cache (urlOrPath bazlı)
  const mediaResolveCacheRef = useRef(new Map()); // key(string) -> Promise<string>

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // owner değişince cache sıfırla
  useEffect(() => {
    hydrateCacheRef.current = new Map();
    mediaResolveCacheRef.current = new Map();
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
        mediaResolveCacheRef.current = new Map();
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

                stopsPreview:
                  Array.isArray(model?.stopsPreview) && model.stopsPreview.length ? model.stopsPreview : stopsPreview,

                coverUrl: isNonEmptyString(model?.coverUrl) ? model.coverUrl : coverUrl,
                thumbnailUrl: isNonEmptyString(model?.thumbnailUrl) ? model.thumbnailUrl : thumbnailUrl,

                previewUrl: isNonEmptyString(model?.previewUrl)
                  ? model.previewUrl
                  : (isNonEmptyString(coverUrl) ? coverUrl : model?.previewUrl) || "",
                thumbUrl: isNonEmptyString(model?.thumbUrl)
                  ? model.thumbUrl
                  : (isNonEmptyString(thumbnailUrl) ? thumbnailUrl : model?.thumbUrl) || "",
                imageUrl: isNonEmptyString(model?.imageUrl)
                  ? model.imageUrl
                  : (isNonEmptyString(coverUrl) ? coverUrl : model?.imageUrl) || "",
                mediaUrl: isNonEmptyString(model?.mediaUrl)
                  ? model.mediaUrl
                  : (isNonEmptyString(coverUrl) ? coverUrl : model?.mediaUrl) || "",

                // raw'ı garanti altına al
                raw: model?.raw && typeof model.raw === "object" ? model.raw : raw,
              };

              return patched;
            })
            .filter(Boolean);

          collected = mode === "reset" ? collected.concat(mapped) : mapped;

          localCursor = nextCursor;

          // reset modunda: hiç rota çıkmadıysa ama daha var → 1-2 sayfa daha tarayalım
          if (mode === "reset") {
            if (collected.length > 0) break;
            if (!localHasMore || !localCursor) break;
            loops += 1;
            continue;
          }

          // more modunda tek sayfa yeter
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

  // ✅ EMİR: stopsPreview + cover resolver (tek fonksiyonda; max 3 concurrent runner bunu çağırır)
  const hydrateRoutePreviewAndCover = useCallback(async (route, jobId) => {
    if (!route || !db) return null;
    if (!isMountedRef.current) return null;
    if (hydrateJobIdRef.current !== jobId) return null;

    const routeId = route?.id ? String(route.id) : "";
    if (!routeId) return null;

    const cached = hydrateCacheRef.current.get(routeId);
    if (cached?.status === "inflight" || cached?.status === "done") return null;

    hydrateCacheRef.current.set(routeId, { status: "inflight" });

    try {
      let stopsPreview =
        Array.isArray(route?.stopsPreview) && route.stopsPreview.length ? route.stopsPreview : [];

      // 1) stopsPreview eksikse routes/{id}/stops hydrate
      if (stopsPreview.length < 2) {
        const stopsCol = collection(db, "routes", routeId, "stops");

        let stopDocs = [];
        try {
          const s1 = await getDocs(query(stopsCol, orderBy("order", "asc"), limit(30)));
          stopDocs = s1.docs || [];
        } catch {
          try {
            const s2 = await getDocs(query(stopsCol, orderBy("idx", "asc"), limit(30)));
            stopDocs = s2.docs || [];
          } catch {
            const s3 = await getDocs(query(stopsCol, limit(30)));
            stopDocs = s3.docs || [];
          }
        }

        if (!isMountedRef.current) return null;
        if (hydrateJobIdRef.current !== jobId) return null;

        const stopsData = (stopDocs || []).map((sd) => ({ id: sd.id, ...(sd.data() || {}) })).slice();

        stopsData.sort((a, b) => {
          const ao =
            (typeof a.order === "number" ? a.order : Number(a.order)) ??
            (typeof a.idx === "number" ? a.idx : Number(a.idx)) ??
            0;
          const bo =
            (typeof b.order === "number" ? b.order : Number(b.order)) ??
            (typeof b.idx === "number" ? b.idx : Number(b.idx)) ??
            0;
          const na = Number.isFinite(ao) ? ao : 0;
          const nb = Number.isFinite(bo) ? bo : 0;
          return na - nb;
        });

        const previewStops = stopsData
          .map((s) => {
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
          })
          .filter(Boolean);

        let sp = previewStops;
        if (sp.length > 2) sp = [sp[0], sp[sp.length - 1]];
        stopsPreview = sp;
      }

      // 2) cover: pickCover(route) -> url render edilebilir https değilse resolver ile downloadURL
      const picked = pickCover(route);
      let candidate = typeof picked?.url === "string" ? picked.url.trim() : "";

      // Candidate yoksa stopsPreview içinden dene
      if (!candidate) {
        candidate = pickCoverCandidateUrl(route, stopsPreview);
      }

      let coverHttps = typeof route?.coverHttps === "string" ? route.coverHttps.trim() : "";
      if (!isRenderableHttpsUrl(coverHttps)) coverHttps = "";

      if (!coverHttps) {
        // render edilebilir değilse -> resolve (gs:// / path / tokenless storage)
        if (candidate && !isRenderableHttpsUrl(candidate) && isLikelyStorageReference(candidate)) {
          const resolved = await resolveMediaToHttps(candidate, mediaResolveCacheRef);
          if (resolved && isRenderableHttpsUrl(resolved)) coverHttps = resolved;
        } else if (candidate && isRenderableHttpsUrl(candidate)) {
          coverHttps = candidate;
        }
      }

      hydrateCacheRef.current.set(routeId, { status: "done" });

      return {
        routeId,
        stopsPreview,
        coverHttps,
      };
    } catch {
      hydrateCacheRef.current.set(routeId, { status: "done" });
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

  // ✅ Lazy hydrate runner (max 3 concurrent) — tek sefer/route + cover resolver
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

        hydrateRoutePreviewAndCover(r, jobId)
          .then((patch) => {
            if (!patch) return;
            if (cancelled) return;
            if (!isMountedRef.current) return;
            if (hydrateJobIdRef.current !== jobId) return;

            const { routeId, stopsPreview, coverHttps } = patch;

            setRoutes((prev) => {
              const next = (prev || []).map((x) => {
                if (!x || String(x.id) !== routeId) return x;

                const nextStopsPreview =
                  Array.isArray(x.stopsPreview) && x.stopsPreview.length >= 2
                    ? x.stopsPreview
                    : Array.isArray(stopsPreview)
                    ? stopsPreview
                    : [];

                const nextCoverHttps =
                  isNonEmptyString(x.coverHttps) && isRenderableHttpsUrl(x.coverHttps)
                    ? x.coverHttps
                    : isNonEmptyString(coverHttps) && isRenderableHttpsUrl(coverHttps)
                    ? coverHttps
                    : "";

                const changed =
                  (Array.isArray(nextStopsPreview) && nextStopsPreview.length >= 2 && (!Array.isArray(x.stopsPreview) || x.stopsPreview.length < 2)) ||
                  (!!nextCoverHttps && !isRenderableHttpsUrl(x.coverHttps));

                if (!changed) {
                  return { ...x, __previewHydrated: true };
                }

                return {
                  ...x,
                  stopsPreview: nextStopsPreview,
                  coverHttps: nextCoverHttps || x.coverHttps || "",
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
  }, [routes, hydrateRoutePreviewAndCover]);

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
