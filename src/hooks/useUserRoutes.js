// src/hooks/useUserRoutes.js
// Profil “Rotalarım” sekmesi için rota listesi hook’u
// EMİR 2 + EMİR 3: RouteCardMobile için standardize model (buildRouteCardModel).

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

            // EMİR 3: Tek tip RouteCardMobile modeli
            const model = buildRouteCardModel({
              id: d.id,
              raw,
              ownerIdFallback: docOwnerId,
              viewerId,
            });

            return model;
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
        // eslint-disable-next-line no-console
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
