// src/pages/RoutesExploreMobile/hooks/useRoutesData.js
// Rota veri katmanı: Yakınımda / Arama / Non-near akışları + sentinel.
// fetchViewportRoutes / searchRoutes / fetchPublicRoutes tek yerde toplanır.

import { useCallback, useEffect, useRef, useState } from "react";
import fetchViewportRoutes, {
  searchRoutes as searchRoutesApi,
} from "../../../services/viewportRoutes";
import { fetchPublicRoutes } from "../../../services/routeSearch";
import { getCreatedAtSec } from "../utils/routeFormatters";
import { mapSortToOrder } from "../utils/sortMap";

const PAGE_SIZE = 20;
const NEAR_LIMIT = 200;

function normalizeRoutes(routes) {
  return (routes || []).map((r) => ({
    ...r,
    ratingAvg: r.ratingAvg ?? r.avgRating ?? 0,
  }));
}

function applyTagFilter(list, tags) {
  if (!tags || !tags.length) return list;
  const wanted = tags.map((t) => String(t).toLowerCase());
  return list.filter((r) => {
    const rTags = (Array.isArray(r.tags) ? r.tags : []).map((t) =>
      String(t).toLowerCase()
    );
    return wanted.every((tag) => rTags.includes(tag));
  });
}

function applyDistanceFilter(list, distRange) {
  if (!distRange || (distRange[0] <= 0 && distRange[1] <= 0)) return list;
  const [minKm, maxKm] = distRange;
  return list.filter((r) => {
    if (typeof r.distanceKm !== "number") return true;
    if (minKm && r.distanceKm < minKm) return false;
    if (maxKm && r.distanceKm > maxKm) return false;
    return true;
  });
}

function applyDurationFilter(list, durRange) {
  if (!durRange || (durRange[0] <= 0 && durRange[1] <= 0)) return list;
  const [minDur, maxDur] = durRange;
  const minMs = minDur > 0 ? minDur * 60000 : 0;
  const maxMs = maxDur > 0 ? maxDur * 60000 : 0;
  return list.filter((r) => {
    const dur = Number(r.durationMs || 0);
    if (minMs && (!dur || dur < minMs)) return false;
    if (maxMs && dur > maxMs) return false;
    return true;
  });
}

export default function useRoutesData({
  sort,
  audience,
  filters,
  followingUids,
  hasSearch,
  debouncedQuery,
  nearBounds,
  near,
  onBumpRecentQuery,
}) {
  const [items, setItems] = useState([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [isEnd, setIsEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const sentinelRef = useRef(null);
  const isMountedRef = useRef(true);
  const searchAbortRef = useRef(null);

  // mount/unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
    };
  }, []);

  const resetAll = useCallback(() => {
    setItems([]);
    setVisibleCount(0);
    setCursor(null);
    setIsEnd(false);
    setLoading(false);
    setLoadingSearch(false);
    setInitialized(false);
  }, []);

  // Yakınımda: viewport değişince rotaları çek (fetchViewportRoutes)
  useEffect(() => {
    if (sort !== "near" || hasSearch) return;
    if (!nearBounds) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      if (!isMountedRef.current || cancelled) return;

      setLoading(true);
      setInitialized(true);
      setLoadingSearch(false);

      (async () => {
        try {
          const { routes } = await fetchViewportRoutes({
            bounds: nearBounds,
            limit: NEAR_LIMIT,
            userLocation:
              near &&
              typeof near.lat === "number" &&
              typeof near.lng === "number"
                ? { lat: near.lat, lng: near.lng }
                : null,
            filters: {
              city: filters?.city || "",
              cc: filters?.country || "",
              minDur: filters?.dur ? filters.dur[0] : 0,
              maxDur: filters?.dur ? filters.dur[1] : 0,
              sort: "distance",
            },
            sort: "distance",
            audience: audience === "following" ? "following" : "all",
            followingUids:
              audience === "following" ? followingUids : undefined,
          });

          if (!isMountedRef.current || cancelled) return;

          let list = normalizeRoutes(routes);

          // Etiket ve mesafe filtresi (near modunda client-side)
          list = applyTagFilter(list, filters?.tags);
          list = applyDistanceFilter(list, filters?.dist);

          // Yakınımda sıralama: distance → ratingAvg → createdAt desc
          list.sort((a, b) => {
            const da =
              typeof a.distanceKm === "number"
                ? a.distanceKm
                : Number.POSITIVE_INFINITY;
            const db =
              typeof b.distanceKm === "number"
                ? b.distanceKm
                : Number.POSITIVE_INFINITY;
            if (da !== db) return da - db;
            const ra = a.ratingAvg ?? 0;
            const rb = b.ratingAvg ?? 0;
            if (rb !== ra) return rb - ra;
            return getCreatedAtSec(b) - getCreatedAtSec(a);
          });

          setItems(list);
          setCursor(null);
          setIsEnd(true);
          setVisibleCount(
            list.length > 0 ? Math.min(list.length, PAGE_SIZE) : 0
          );
        } catch {
          if (!isMountedRef.current || cancelled) return;
          setItems([]);
          setCursor(null);
          setIsEnd(true);
          setVisibleCount(0);
        } finally {
          if (!isMountedRef.current || cancelled) return;
          setLoading(false);
          setLoadingSearch(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    sort,
    hasSearch,
    audience,
    followingUids,
    filters,
    near,
    nearBounds,
  ]);

  // Non-near ilk sayfa (En yeni / En çok oy / En yüksek puan)
  const loadFirstNonNear = useCallback(async () => {
    setLoading(true);
    setInitialized(false);
    setLoadingSearch(false);

    try {
      const { items: page, nextCursor } = await fetchPublicRoutes({
        order: mapSortToOrder(sort),
        limit: PAGE_SIZE,
        city: filters?.city || "",
        countryCode: filters?.country || "",
      });

      if (!isMountedRef.current) return;

      let list = normalizeRoutes(page);

      if (audience === "following") {
        if (followingUids.length) {
          const followSet = new Set(
            followingUids.map((id) => String(id))
          );
          list = list.filter((r) => {
            const owner =
              r.ownerId ||
              r.userId ||
              r.uid ||
              r.ownerUID ||
              r.ownerUid ||
              r.userUID;
            if (!owner) return false;
            return followSet.has(String(owner));
          });
        } else {
          list = [];
        }
      }

      // Non-near'da city/country server tarafında filtreleniyor; tags/dist/dur UI'da
      list = applyTagFilter(list, filters?.tags);
      list = applyDistanceFilter(list, filters?.dist);
      list = applyDurationFilter(list, filters?.dur);

      setItems(list);
      setCursor(nextCursor || null);
      setIsEnd(!nextCursor || !list.length);
      setVisibleCount(list.length ? Math.min(list.length, PAGE_SIZE) : 0);
      setInitialized(true);
    } catch {
      if (!isMountedRef.current) return;
      setItems([]);
      setCursor(null);
      setIsEnd(true);
      setVisibleCount(0);
      setInitialized(true);
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
    }
  }, [sort, filters, audience, followingUids]);

  const loadMoreNonNear = useCallback(async () => {
    if (sort === "near") return;
    if (loading || isEnd || !cursor) return;

    setLoading(true);
    try {
      const { items: page, nextCursor } = await fetchPublicRoutes({
        order: mapSortToOrder(sort),
        limit: PAGE_SIZE,
        city: filters?.city || "",
        countryCode: filters?.country || "",
        cursor,
      });

      if (!isMountedRef.current) return;

      let list = normalizeRoutes(page);

      if (audience === "following") {
        if (followingUids.length) {
          const followSet = new Set(
            followingUids.map((id) => String(id))
          );
          list = list.filter((r) => {
            const owner =
              r.ownerId ||
              r.userId ||
              r.uid ||
              r.ownerUID ||
              r.ownerUid ||
              r.userUID;
            if (!owner) return false;
            return followSet.has(String(owner));
          });
        } else {
          list = [];
        }
      }

      list = applyTagFilter(list, filters?.tags);
      list = applyDistanceFilter(list, filters?.dist);
      list = applyDurationFilter(list, filters?.dur);

      setItems((prev) => prev.concat(list));
      setCursor(nextCursor || null);
      setIsEnd(!nextCursor || !list.length);
    } catch {
      if (!isMountedRef.current) return;
      setIsEnd(true);
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
    }
  }, [
    sort,
    filters,
    audience,
    followingUids,
    loading,
    isEnd,
    cursor,
  ]);

  // sort/audience/filtre değişince non-near akışını resetle
  useEffect(() => {
    if (sort === "near" || hasSearch) return;

    setItems([]);
    setCursor(null);
    setIsEnd(false);
    setVisibleCount(0);

    loadFirstNonNear();
  }, [
    sort,
    audience,
    filters?.city,
    filters?.country,
    filters?.tags,
    filters?.dist,
    filters?.dur,
    followingUids,
    loadFirstNonNear,
    hasSearch,
  ]);

  // Arama modu (searchRoutes + AbortController + requestId)
  useEffect(() => {
    if (!hasSearch) {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
      setLoadingSearch(false);
      return;
    }

    const trimmed = (debouncedQuery || "").trim();
    if (!trimmed) {
      setLoadingSearch(false);
      return;
    }

    const currentReqId = (searchAbortRef.current?._reqId || 0) + 1;

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    controller._reqId = currentReqId;
    searchAbortRef.current = controller;

    if (typeof onBumpRecentQuery === "function") {
      onBumpRecentQuery(trimmed);
    }

    const filtersSnapshot = { ...(filters || {}) };
    const audienceSnapshot = audience;
    const followingSnapshot = [...followingUids];
    const sortSnapshot = sort;

    setLoading(true);
    setLoadingSearch(true);
    setInitialized(false);
    setItems([]);
    setCursor(null);
    setIsEnd(true);
    setVisibleCount(0);

    (async () => {
      try {
        const { routes } = await searchRoutesApi({
          queryText: trimmed,
          limit: PAGE_SIZE * 3,
          audience: audienceSnapshot,
          followingUids:
            audienceSnapshot === "following" ? followingSnapshot : undefined,
          sort: sortSnapshot,
          signal: controller.signal,
        });

        if (
          !isMountedRef.current ||
          controller.signal.aborted ||
          controller._reqId !== currentReqId
        ) {
          return;
        }

        let list = normalizeRoutes(routes);

        // City/ülke filtresi
        if (filtersSnapshot.city) {
          const lcCity = filtersSnapshot.city.toLowerCase();
          list = list.filter(
            (r) =>
              (r?.areas?.city || "").toString().toLowerCase() === lcCity
          );
        }

        if (filtersSnapshot.country) {
          const lcCountry = filtersSnapshot.country.toLowerCase();
          list = list.filter((r) => {
            const cc =
              (
                r?.areas?.countryName ||
                r?.areas?.country ||
                r?.areas?.countryCode ||
                r?.areas?.cc ||
                ""
              )
                .toString()
                .toLowerCase();
            return cc.includes(lcCountry);
          });
        }

        // Etiket, mesafe, süre filtreleri
        list = applyTagFilter(list, filtersSnapshot.tags);
        list = applyDistanceFilter(list, filtersSnapshot.dist);
        list = applyDurationFilter(list, filtersSnapshot.dur);

        setItems(list);
        setVisibleCount(
          list.length > 0 ? Math.min(list.length, PAGE_SIZE) : 0
        );
        setIsEnd(true);
        setInitialized(true);
      } catch (err) {
        if (
          controller.signal.aborted ||
          err?.name === "AbortError" ||
          !isMountedRef.current ||
          controller._reqId !== currentReqId
        ) {
          return;
        }
        setItems([]);
        setVisibleCount(0);
        setIsEnd(true);
        setInitialized(true);
      } finally {
        if (
          !isMountedRef.current ||
          controller.signal.aborted ||
          controller._reqId !== currentReqId
        ) {
          return;
        }
        setLoading(false);
        setLoadingSearch(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    hasSearch,
    debouncedQuery,
    audience,
    followingUids,
    sort,
    filters,
    onBumpRecentQuery,
  ]);

  // Sonsuz kaydırma (sentinel)
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting) return;

        setVisibleCount((prev) => {
          const next = Math.min(items.length, prev + PAGE_SIZE);
          if (next > prev) {
            return next;
          }
          if (!hasSearch && sort !== "near") {
            loadMoreNonNear();
          }
          return prev;
        });
      },
      {
        rootMargin: "800px 0px 800px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [items.length, sort, hasSearch, loadMoreNonNear]);

  const visibleItems =
    visibleCount > 0 ? items.slice(0, visibleCount) : items;
  const totalCount = items.length;

  return {
    items,
    visibleItems,
    totalCount,
    isEnd,
    loading,
    initialized,
    loadingSearch,
    sentinelRef,
    loadMoreNonNear,
    resetAll,
  };
}
