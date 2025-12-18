// src/hooks/useUserRoutes.js
// Profil “Rotalarım” sekmesi için rota listesi hook’u
// EMİR 2 + EMİR 3: RouteCardMobile için standardize model (buildRouteCardModel).
// EMİR 10: Grid’e PREVIEW veri bind edilecek (stopsPreview/cover/thumbnail). Gerekirse HYDRATE (lazy fetch).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  buildRouteCardModel,
  getOwnerIdFromRaw,
  getVisibilityKey,
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
    // array/object/number - accept as is
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

function extractStopLatLng(s) {
  if (!s || typeof s !== "object") return { lat: null, lng: null };
  const lat =
    pickFirst(s, ["lat", "latitude", "location.lat", "position.lat"]) ?? null;
  const lng =
    pickFirst(s, ["lng", "lon", "longitude", "location.lng", "position.lng"]) ??
    null;
  const nlat = typeof lat === "number" ? lat : Number(lat);
  const nlng = typeof lng === "number" ? lng : Number(lng);
  return {
    lat: Number.isFinite(nlat) ? nlat : null,
    lng: Number.isFinite(nlng) ? nlng : null,
  };
}

function extractStopMediaUrl(s) {
  if (!s) return "";
  // common direct fields
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

  // array forms: media / medias / gallery
  const arr =
    pickFirst(s, ["media", "medias", "gallery", "items", "photos"]) || null;
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
    // sometimes stored under {items:[...]} or similar
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
        // keep original fields minimally
        if (s.id) out.id = s.id;
        if (s.order !== undefined) out.order = s.order;
        return Object.keys(out).length ? out : null;
      }
      return null;
    })
    .filter(Boolean);

  // Tile genelde ilk ve son durağı kullanıyor → hafiflet
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
    "stops", // bazı şemalarda direkt stops array var
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

  // Başlık üretimi için en az 1-2 stop preview iyi; cover için de görsel şart.
  return !hasStopsPreview || !hasCover;
}

export default function useUserRoutes(ownerId, options = {}) {
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    isSelf = false,
    isFollowing = false,
    viewerId = null,
  } = options;

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
      // ownerId yoksa ya da db yoksa: state'i temizle ve loader'ı kapat
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

        // reset → hydrate cache de temiz (aynı owner olsa bile)
        hydrateCacheRef.current = new Map();
        hydrateJobIdRef.current += 1;
      } else {
        setLoadingMore(true);
      }

      try {
        const colRef = collection(db, "routes");

        /**
         * ÖNEMLİ:
         * Burada doğrudan `where("ownerId", "==", ownerId)` yerine:
         * - `createdAt`’e göre global liste çekiyoruz
         * - Sonrasında ownerId / userId eşleşmesine göre client-side filtreliyoruz
         *
         * Böylece:
         * - Mevcut çalışan rota akışının şemasına uymaya devam ediyoruz
         * - Yeni bir composite index zorunluluğu çıkarmıyoruz
         * - Skeleton'ın index hatasına takılı kalma ihtimalini ortadan kaldırıyoruz
         */
        const constraints = [orderBy("createdAt", "desc")];

        if (mode === "more" && cursorRef.current) {
          constraints.push(startAfter(cursorRef.current));
        }

        constraints.push(limit(pageSize + 1));

        const q = query(colRef, ...constraints);
        const snap = await getDocs(q);

        if (!isMountedRef.current || reqId !== requestIdRef.current) {
          return;
        }

        const docs = snap.docs;
        const pageDocs = docs.slice(0, pageSize);
        const nextCursor =
          docs.length > pageSize ? docs[docs.length - 1] : null;

        const mapped = pageDocs
          .map((d) => {
            const raw = d.data() || {};

            // Bu doküman gerçekten bu kullanıcıya mı ait?
            const docOwnerId = getOwnerIdFromRaw(raw, ownerId);
            if (!docOwnerId || docOwnerId !== ownerId) {
              return null;
            }

            // Silinmiş / arşivlenmiş kayıtlar
            const deleted =
              raw.deleted === true ||
              !!raw.deletedAt ||
              !!raw.isDeleted ||
              !!raw.archivedAt;
            if (deleted) return null;

            // Status: varsa sadece finished göster
            const status = (raw.status || "").toString().toLowerCase();
            if (status && status !== "finished") {
              return null;
            }

            const visibilityKey = getVisibilityKey(raw);

            // Görünürlük filtresi (başkasının profiline bakarken)
            if (!isSelf) {
              if (visibilityKey === "private") {
                return null;
              }
              if (!isFollowing && visibilityKey === "followers") {
                return null;
              }
              // unknown → dışarıya göstermemek daha güvenli
              if (visibilityKey === "unknown") {
                return null;
              }
            }

            // EMİR 3: Tek tip RouteCardMobile modeli
            const model = buildRouteCardModel({
              id: d.id,
              raw,
              ownerIdFallback: docOwnerId,
              viewerId,
            });

            // ✅ EMİR 10: Preview alanlarını grid’e BIND et (doc.data() kaynaklı)
            const { stopsPreview, coverUrl, thumbnailUrl } =
              extractPreviewFromRouteDoc(raw);

            const patched = {
              ...model,
              // canonical keys
              stopsPreview:
                Array.isArray(model?.stopsPreview) && model.stopsPreview.length
                  ? model.stopsPreview
                  : stopsPreview,
              coverUrl:
                isNonEmptyString(model?.coverUrl) ? model.coverUrl : coverUrl,
              thumbnailUrl:
                isNonEmptyString(model?.thumbnailUrl)
                  ? model.thumbnailUrl
                  : thumbnailUrl,

              // extra aliases (tile nereden okuyorsa yakalasın)
              previewUrl:
                isNonEmptyString(model?.previewUrl)
                  ? model.previewUrl
                  : (isNonEmptyString(coverUrl) ? coverUrl : model?.previewUrl) || "",
              thumbUrl:
                isNonEmptyString(model?.thumbUrl)
                  ? model.thumbUrl
                  : (isNonEmptyString(thumbnailUrl) ? thumbnailUrl : model?.thumbUrl) || "",
              imageUrl:
                isNonEmptyString(model?.imageUrl)
                  ? model.imageUrl
                  : (isNonEmptyString(coverUrl) ? coverUrl : model?.imageUrl) || "",
              mediaUrl:
                isNonEmptyString(model?.mediaUrl)
                  ? model.mediaUrl
                  : (isNonEmptyString(coverUrl) ? coverUrl : model?.mediaUrl) || "",

              // raw her zaman plain object kalsın (snapshot değil)
              raw: model?.raw && typeof model.raw === "object" ? model.raw : raw,
            };

            return patched;
          })
          .filter(Boolean);

        setRoutes((prev) => (mode === "reset" ? mapped : prev.concat(mapped)));
        cursorRef.current = nextCursor;
        setHasMore(!!nextCursor);
      } catch (err) {
        if (!isMountedRef.current || reqId !== requestIdRef.current) {
          return;
        }
        // eslint-disable-next-line no-console
        console.warn("[useUserRoutes] load error", err);
        if (mode === "reset") {
          setRoutes([]);
        }
        setHasMore(false);
        setError(err || new Error("Rotalar yüklenirken bir hata oluştu."));
      } finally {
        if (!isMountedRef.current || reqId !== requestIdRef.current) {
          return;
        }
        // Hangi senaryo olursa olsun loader'lar kapanacak
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [ownerId, pageSize, isSelf, isFollowing, viewerId]
  );

  // ✅ EMİR 10 / Çözüm B: stopsPreview/cover yoksa lazy HYDRATE
  const hydrateOneRoutePreview = useCallback(
    async (routeId, jobId) => {
      if (!routeId || !db) return null;
      if (!isMountedRef.current) return null;
      if (hydrateJobIdRef.current !== jobId) return null;

      const rid = String(routeId);
      const cached = hydrateCacheRef.current.get(rid);
      if (cached?.status === "inflight" || cached?.status === "done") {
        return null;
      }
      hydrateCacheRef.current.set(rid, { status: "inflight" });

      try {
        const stopsCol = collection(db, "routes", rid, "stops");

        let stopDocs = [];
        try {
          // önce order ile dene
          const s1 = await getDocs(
            query(stopsCol, orderBy("order", "asc"), limit(30))
          );
          stopDocs = s1.docs || [];
        } catch {
          try {
            // bazı şemalarda idx var
            const s2 = await getDocs(
              query(stopsCol, orderBy("idx", "asc"), limit(30))
            );
            stopDocs = s2.docs || [];
          } catch {
            // son çare: orderBy yok
            const s3 = await getDocs(query(stopsCol, limit(30)));
            stopDocs = s3.docs || [];
          }
        }

        if (!isMountedRef.current) return null;
        if (hydrateJobIdRef.current !== jobId) return null;

        const stopsData = (stopDocs || [])
          .map((sd) => ({ id: sd.id, ...(sd.data() || {}) }))
          .slice();

        // client-side sort (garanti)
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

        // hafiflet: ilk + son
        let stopsPreview = previewStops;
        if (stopsPreview.length > 2) {
          stopsPreview = [stopsPreview[0], stopsPreview[stopsPreview.length - 1]];
        }

        // cover için: ilk bulunan mediaUrl
        let coverUrl = "";
        for (const sp of stopsPreview) {
          if (isNonEmptyString(sp?.mediaUrl)) {
            coverUrl = String(sp.mediaUrl).trim();
            break;
          }
        }
        if (!coverUrl) {
          // ilk 10 stop içinde tarama
          for (const s of previewStops.slice(0, 10)) {
            if (isNonEmptyString(s?.mediaUrl)) {
              coverUrl = String(s.mediaUrl).trim();
              break;
            }
          }
        }

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
    },
    []
  );

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

    const targets = routes
      .filter((r) => needsHydratePreview(r))
      .slice(0, 24); // ilk sayfada/ilk partide yeter

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
        if (cached?.status === "inflight" || cached?.status === "done") {
          continue;
        }

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

                const existingCover =
                  x.coverUrl ||
                  x.previewUrl ||
                  x.thumbnailUrl ||
                  x.thumbUrl ||
                  x.imageUrl ||
                  x.mediaUrl ||
                  "";

                const nextCover = isNonEmptyString(existingCover)
                  ? existingCover
                  : (isNonEmptyString(patch.coverUrl) ? patch.coverUrl : "");

                const nextStopsPreview =
                  Array.isArray(x.stopsPreview) && x.stopsPreview.length
                    ? x.stopsPreview
                    : (Array.isArray(patch.stopsPreview) ? patch.stopsPreview : []);

                // hiç bir şey değişmiyorsa dokunma
                const changed =
                  (!Array.isArray(x.stopsPreview) || x.stopsPreview.length === 0) &&
                    nextStopsPreview.length > 0
                    ? true
                    : (!isNonEmptyString(existingCover) && isNonEmptyString(nextCover))
                    ? true
                    : false;

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

  const isEmpty = !initialLoading && routes.length === 0;

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
