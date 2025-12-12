// src/pages/RoutesExploreMobile/hooks/useRoutesData.js
// Rota veri katmanı: Yakınımda / Arama / Non-near akışları + sentinel.
// EMİR 10: Tek in-flight AbortController, near'da sentinel görünür sayıyı artırır,
// aramada tüm sonuçlar görünür. EMİR 12: dupe-guard + windowing uyumlu.
// EMİR 3: Tüm rotalar RouteCardMobile standard modeline maplenir (buildRouteCardModel).

import { useCallback, useEffect, useRef, useState } from "react";
import fetchViewportRoutes, {
  searchRoutes as searchRoutesApi,
} from "../../../services/viewportRoutes";
import { fetchPublicRoutes } from "../../../services/routeSearch";
import { getCreatedAtSec } from "../utils/routeFormatters";
import { mapSortToOrder } from "../utils/sortMap";
import { buildRouteCardModel } from "../../../routes/routeCardModel";

const PAGE_SIZE = 20;
const NEAR_LIMIT = 200;

// EMİR 3: RouteCardMobile canonical modeli
function normalizeRoutes(routes) {
  return (routes || []).map((r) => {
    const model = buildRouteCardModel({ raw: r });

    // Eski davranışla uyum: Eğer upstream ratingAvg/avgRating varsa ve
    // helper 0 üretmişse, bunu koru.
    const fallbackRating =
      typeof r.ratingAvg === "number"
        ? r.ratingAvg
        : typeof r.avgRating === "number"
        ? r.avgRating
        : null;

    if (
      fallbackRating !== null &&
      (typeof model.ratingAvg !== "number" ||
        Number.isNaN(model.ratingAvg) ||
        model.ratingAvg === 0)
    ) {
      return {
        ...model,
        ratingAvg: fallbackRating,
      };
    }

    return model;
  });
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

// EMİR 12: id bazlı tekilleştirme (dupe-guard)
function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const r of list || []) {
    if (!r) continue;
    const id = r.id !== undefined && r.id !== null ? String(r.id) : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}
function mergeDedup(prev, next) {
  if (!prev?.length) return dedupeById(next);
  if (!next?.length) return prev.slice();
  const seen = new Set(prev.map((r) => String(r.id)));
  const merged = prev.slice();
  for (const r of next) {
    if (!r) continue;
    const id = r.id !== undefined && r.id !== null ? String(r.id) : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(r);
  }
  return merged;
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
  const inFlightRef = useRef(null); // EMİR 10 – tek in-flight
  const observerRef = useRef(null);

  // Mount / unmount cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (inFlightRef.current) {
        try {
          inFlightRef.current.controller.abort();
        } catch {}
        inFlightRef.current = null;
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  // Tekil istek yönetimi (EMİR 10)
  function beginRequest() {
    if (inFlightRef.current) {
      try {
        inFlightRef.current.controller.abort();
      } catch {}
    }
    const controller = new AbortController();
    const reqId = (inFlightRef.current?.reqId || 0) + 1;
    inFlightRef.current = { controller, reqId };
    return { controller, reqId };
  }
  function isRequestStale(controller, reqId) {
    if (!isMountedRef.current) return true;
    if (!controller || controller.signal.aborted) return true;
    if (!inFlightRef.current) return true;
    if (inFlightRef.current.controller !== controller) return true;
    if (inFlightRef.current.reqId !== reqId) return true;
    return false;
  }
  function endRequest(controller, reqId) {
    if (
      inFlightRef.current &&
      inFlightRef.current.controller === controller &&
      inFlightRef.current.reqId === reqId
    ) {
      inFlightRef.current = null;
    }
  }

  const resetAll = useCallback(() => {
    if (inFlightRef.current) {
      try {
        inFlightRef.current.controller.abort();
      } catch {}
      inFlightRef.current = null;
    }
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    setItems([]);
    setVisibleCount(0);
    setCursor(null);
    setIsEnd(false);
    setLoading(false);
    setLoadingSearch(false);
    setInitialized(false);
  }, []);

  // Yakınımda: viewport değişince rotaları çek
  useEffect(() => {
    if (sort !== "near" || hasSearch) return;
    if (!nearBounds) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!isMountedRef.current || cancelled) return;

      setLoading(true);
      setInitialized(true);
      setLoadingSearch(false);

      const { controller, reqId } = beginRequest();

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
            signal: controller.signal,
          });

          if (isRequestStale(controller, reqId)) return;

          let list = normalizeRoutes(routes);

          // Etiket ve mesafe filtresi (near modunda client-side)
          list = applyTagFilter(list, filters?.tags);
          list = applyDistanceFilter(list, filters?.dist);

          // Sıralama: distance → ratingAvg → createdAt desc
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

          list = dedupeById(list);

          setItems(list);
          setCursor(null);
          setIsEnd(true); // near: sayfalama yok
          setVisibleCount(
            list.length > 0 ? Math.min(list.length, PAGE_SIZE) : 0
          );
        } catch (err) {
          if (isRequestStale(controller, reqId) || err?.name === "AbortError") {
            return;
          }
          setItems([]);
          setCursor(null);
          setIsEnd(true);
          setVisibleCount(0);
        } finally {
          if (isRequestStale(controller, reqId)) return;
          setLoading(false);
          setLoadingSearch(false);
          endRequest(controller, reqId);
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

  // Non-near ilk sayfa
  const loadFirstNonNear = useCallback(async () => {
    if (sort === "near" || hasSearch) return;

    setLoading(true);
    setInitialized(false);
    setLoadingSearch(false);

    const { controller, reqId } = beginRequest();

    try {
      const { items: page, nextCursor } = await fetchPublicRoutes({
        order: mapSortToOrder(sort),
        limit: PAGE_SIZE,
        city: filters?.city || "",
        countryCode: filters?.country || "",
        audience,
        followingUids: audience === "following" ? followingUids : undefined,
        signal: controller.signal,
      });

      if (isRequestStale(controller, reqId)) return;

      let list = normalizeRoutes(page);

      // Ek güvenlik: following client-side
      if (audience === "following") {
        if (followingUids.length) {
          const followSet = new Set(followingUids.map((id) => String(id)));
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
      list = dedupeById(list);

      setItems(list);
      setCursor(nextCursor || null);
      setIsEnd(!nextCursor || !page.length);
      setVisibleCount(list.length ? Math.min(list.length, PAGE_SIZE) : 0);
      setInitialized(true);
    } catch (err) {
      if (isRequestStale(controller, reqId) || err?.name === "AbortError") {
        return;
      }
      setItems([]);
      setCursor(null);
      setIsEnd(true);
      setVisibleCount(0);
      setInitialized(true);
    } finally {
      if (isRequestStale(controller, reqId)) return;
      setLoading(false);
      endRequest(controller, reqId);
    }
  }, [
    sort,
    hasSearch,
    filters?.city,
    filters?.country,
    filters?.tags,
    filters?.dist,
    filters?.dur,
    audience,
    followingUids,
  ]);

  // Non-near sonraki sayfa
  const loadMoreNonNear = useCallback(async () => {
    if (sort === "near" || hasSearch) return;
    if (loading || loadingSearch || isEnd || !cursor) return;

    setLoading(true);
    const { controller, reqId } = beginRequest();

    try {
      const { items: page, nextCursor } = await fetchPublicRoutes({
        order: mapSortToOrder(sort),
        limit: PAGE_SIZE,
        city: filters?.city || "",
        countryCode: filters?.country || "",
        audience,
        followingUids: audience === "following" ? followingUids : undefined,
        cursor,
        signal: controller.signal,
      });

      if (isRequestStale(controller, reqId)) return;

      let list = normalizeRoutes(page);

      if (audience === "following") {
        if (followingUids.length) {
          const followSet = new Set(followingUids.map((id) => String(id)));
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
      list = dedupeById(list);

      setItems((prev) => mergeDedup(prev, list));
      setCursor(nextCursor || null);
      setIsEnd(!nextCursor || !page.length);
    } catch (err) {
      if (isRequestStale(controller, reqId) || err?.name === "AbortError") {
        return;
      }
      setIsEnd(true);
    } finally {
      if (isRequestStale(controller, reqId)) return;
      setLoading(false);
      endRequest(controller, reqId);
    }
  }, [
    sort,
    hasSearch,
    loading,
    loadingSearch,
    isEnd,
    cursor,
    filters?.city,
    filters?.country,
    filters?.tags,
    filters?.dist,
    filters?.dur,
    audience,
    followingUids,
  ]);

  // Non-near akışı: sort/audience/filtre değişince ilk sayfa
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
    hasSearch,
    loadFirstNonNear,
  ]);

  // Arama modu
  useEffect(() => {
    if (!hasSearch) {
      if (inFlightRef.current) {
        try {
          inFlightRef.current.controller.abort();
        } catch {}
        inFlightRef.current = null;
      }
      setLoadingSearch(false);
      return;
    }

    const trimmed = (debouncedQuery || "").trim();
    if (!trimmed) {
      if (inFlightRef.current) {
        try {
          inFlightRef.current.controller.abort();
        } catch {}
        inFlightRef.current = null;
      }
      setItems([]);
      setVisibleCount(0);
      setCursor(null);
      setIsEnd(true);
      setInitialized(true);
      setLoading(false);
      setLoadingSearch(false);
      return;
    }

    const { controller, reqId } = beginRequest();

    const filtersSnapshot = { ...(filters || {}) };
    const audienceSnapshot = audience;
    const followingSnapshot = [...followingUids];
    const sortSnapshot = sort;

    setLoading(true);
    setLoadingSearch(true);
    setInitialized(false);
    setItems([]);
    setVisibleCount(0);
    setCursor(null);
    setIsEnd(true);

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

        if (isRequestStale(controller, reqId)) return;

        let list = normalizeRoutes(routes);

        // City/ülke
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
            const cc = (
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

        list = applyTagFilter(list, filtersSnapshot.tags);
        list = applyDistanceFilter(list, filtersSnapshot.dist);
        list = applyDurationFilter(list, filtersSnapshot.dur);
        list = dedupeById(list);

        setItems(list);
        setVisibleCount(
          list.length > 0 ? Math.min(list.length, PAGE_SIZE) : 0
        );
        setIsEnd(true);
        setInitialized(true);

        if (typeof onBumpRecentQuery === "function") {
          onBumpRecentQuery(trimmed);
        }
      } catch (err) {
        if (isRequestStale(controller, reqId) || err?.name === "AbortError") {
          return;
        }
        setItems([]);
        setVisibleCount(0);
        setIsEnd(true);
        setInitialized(true);
      } finally {
        if (isRequestStale(controller, reqId)) return;
        setLoading(false);
        setLoadingSearch(false);
        endRequest(controller, reqId);
      }
    })();

    return () => {
      try {
        inFlightRef.current?.controller?.abort();
      } catch {}
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

  // Sonsuz kaydırma (sentinel) – near + non-near (arama hariç)
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    // Arama modunda veya yükleme/sonda: observer devre dışı
    // Not: EMİR 10 — near'da isEnd true olsa bile görünür sayıyı büyütmek için aktif kalabilir.
    if (
      hasSearch ||
      loading ||
      loadingSearch ||
      (isEnd && sort !== "near")
    ) {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      return;
    }

    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting) return;

        setVisibleCount((prev) => {
          const next = Math.min(items.length, prev + PAGE_SIZE);
          if (next > prev) {
            return next;
          }
          // Non-near modda, tüm mevcut kartlar görünürse yeni sayfayı iste
          if (
            sort !== "near" &&
            !loading &&
            !loadingSearch &&
            !isEnd
          ) {
            loadMoreNonNear();
          }
          return prev;
        });
      },
      {
        root: null,
        rootMargin: "600px 0px 1200px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(node);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [
    hasSearch,
    loading,
    loadingSearch,
    isEnd,
    sort,
    items.length,
    loadMoreNonNear,
  ]);

  // Arama modunda tüm sonuçları göster; diğerlerinde görünür sayıya göre kısıtla
  const visibleItems =
    hasSearch
      ? items
      : visibleCount > 0
      ? items.slice(0, visibleCount)
      : items;

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
    resetAll,
  };
}
