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

/**
 * Kullanıcının rotalarını profilde listelemek için hook.
 *
 * Amaç:
 * - Mevcut Firestore şemasını uydurmadan kullanmak
 * - Gizlilik kurallarına uymak (public / followers / private)
 * - Sayfalama (loadMore) desteklemek
 */

const DEFAULT_PAGE_SIZE = 20;

function getVisibilityKey(raw) {
  const source =
    raw.visibility ??
    raw.audience ??
    raw.routeVisibility ??
    raw.privacy ??
    "";
  const v = source.toString().toLowerCase();

  if (!v || v === "public" || v === "everyone") return "public";

  if (
    v === "followers" ||
    v === "followers_only" ||
    v === "followers-only" ||
    v === "friends" ||
    v.includes("follower")
  ) {
    return "followers";
  }

  if (v === "private" || v === "only_me") return "private";

  return "unknown";
}

function buildStats(raw) {
  const distanceM =
    raw.totalDistanceM ??
    raw.distanceMeters ??
    raw.distance ??
    raw.total_distance_m ??
    0;

  const durationMs =
    raw.durationMs ??
    raw.durationMilliseconds ??
    (typeof raw.durationSeconds === "number"
      ? raw.durationSeconds * 1000
      : undefined) ??
    raw.duration ??
    0;

  const stops =
    (Array.isArray(raw.stops) && raw.stops.length) ||
    (Array.isArray(raw.waypoints) && raw.waypoints.length) ||
    0;

  const distanceKm = distanceM / 1000;
  const durationHours = durationMs / (1000 * 60 * 60);
  const avgKmh =
    distanceKm > 0 && durationHours > 0
      ? Math.round((distanceKm / durationHours) * 10) / 10
      : null;

  return {
    distanceM,
    durationMs,
    stops,
    distanceKm,
    avgKmh,
  };
}

function getOwnerIdFromRaw(raw, fallbackOwnerId) {
  if (!raw) return fallbackOwnerId || null;

  const v =
    raw.ownerId ||
    raw.userId ||
    raw.uid ||
    raw.accountId ||
    raw.createdBy ||
    fallbackOwnerId;

  return v || null;
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

            const stats = buildStats(raw);

            const createdAt =
              raw.createdAt ||
              raw.startedAt ||
              raw.startTime ||
              raw.finishedAt ||
              null;

            const finishedAt = raw.finishedAt || raw.endTime || null;

            return {
              id: d.id,
              ownerId: docOwnerId,
              title: raw.title || raw.name || "",
              visibility:
                raw.visibility ||
                raw.audience ||
                raw.routeVisibility ||
                raw.privacy ||
                visibilityKey ||
                "public",
              createdAt,
              finishedAt,
              deletedAt: raw.deletedAt || null,
              stats,
              raw,
              viewerId,
            };
          })
          .filter(Boolean);

        setRoutes((prev) =>
          mode === "reset" ? mapped : prev.concat(mapped)
        );
        cursorRef.current = nextCursor;
        setHasMore(!!nextCursor);
      } catch (err) {
        if (!isMountedRef.current || reqId !== requestIdRef.current) {
          return;
        }
        console.warn("[useUserRoutes] load error", err);
        if (mode === "reset") {
          setRoutes([]);
        }
        setHasMore(false);
        setError(
          err || new Error("Rotalar yüklenirken bir hata oluştu.")
        );
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
