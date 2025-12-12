// src/pages/RoutesExploreMobile/RoutesExploreMobile.jsx
// Keşif ekranı – Hepsi/Takip, Yakınımda/En yeni/En çok oy/En yüksek puan,
// arama (debounce + AbortController + son aramalar),
// URL/LocalStorage senkronu (m/a/s/q/sel + groupBy/city/country/tags),
// Yakınımda harita (Google Maps) + "Bu alanda ara" CTA + pin↔kart senkronu,
// near/search/non-near veri akışı ve sonsuz kaydırma (useRoutesData).
// EMİR 11: RouteFilterSheet lazy-load + memoization
// EMİR 12: Hafif windowing (useWindowedList) + dupe-guard (useRoutesData içinde)

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  Suspense,
  lazy,
} from "react";
import { auth } from "../../firebase";

import { getFollowingUids } from "../../services/follows";

import NearbyPromptMobile from "../../components/NearbyPromptMobile";
import RouteCardMobile from "../../components/RouteCardMobile";

import {
  DEFAULT_AUDIENCE,
  DEFAULT_SORT,
  DEFAULT_GROUP,
  getInitialRouteUiState,
  getInitialRouteFilters,
} from "./utils/stateInit";

import { makeGroups } from "./utils/grouping";

import useSearchBar from "./hooks/useSearchBar";
import useExploreParamsSync from "./hooks/useExploreParamsSync";
import useNearMapController from "./hooks/useNearMapController";
import useRoutesData from "./hooks/useRoutesData";
import useWindowedList from "./hooks/useWindowedList";

// EMİR 9: eksik import FIX
import SearchBarMobile from "./components/SearchBarMobile";

// NearMapPane lazy-load (EMİR 9)
const NearMapPane = lazy(() => import("./components/NearMapPane"));

// RouteFilterSheet lazy-load (EMİR 11)
const RouteFilterSheetLazy = lazy(() =>
  import("../../components/RouteFilterSheet")
);

function RoutesExploreMobile() {
  const initialRef = useRef(null);
  if (!initialRef.current) {
    initialRef.current = {
      ui: getInitialRouteUiState(),
      filters: getInitialRouteFilters(),
    };
  }

  const [audience, setAudience] = useState(initialRef.current.ui.audience);
  const [sort, setSort] = useState(initialRef.current.ui.sort);
  const [group, setGroup] = useState(initialRef.current.ui.group);

  const {
    searchText,
    setSearchText,
    debouncedQuery,
    hasSearch,
    recentQueries,
    showRecentList,
    bumpRecentQuery,
    handlers: {
      onFocus: handleSearchFocus,
      onBlur: handleSearchBlur,
      onKeyDown: handleSearchKeyDown,
      onRecentClick: handleRecentClick,
      onRecentClear: handleRecentClearClick,
      clearSearch,
    },
  } = useSearchBar({
    initialQuery: initialRef.current.ui.query || "",
  });

  const [filters, setFilters] = useState(initialRef.current.filters);

  const [followingUids, setFollowingUids] = useState([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const [selectedRouteId, setSelectedRouteId] = useState(
    initialRef.current.ui.selectedId || null
  );

  const [nearBounds, setNearBounds] = useState(null);

  const cardRefs = useRef({});
  const toastTimerRef = useRef(null);
  const wasSearchingRef = useRef(false);
  const listContainerRef = useRef(null);
  // EMİR 8: "Bu alanda ara" → resetAll köprüsü için ref
  const resetDataStateRef = useRef(null);

  // EMİR 13: Haritaya giden pin listesi için ayrı state
  const [itemsForMap, setItemsForMap] = useState([]);

  // URL & LocalStorage senkronu (m/a/s/q/sel + groupBy/city/country/tags)
  useExploreParamsSync({
    state: {
      audience,
      sort,
      group,
      filters,
      searchText,
      selectedRouteId,
    },
    setters: {
      setAudience,
      setSort,
      setGroup,
      setFilters,
      setSearchText,
      setSelectedRouteId,
    },
  });

  // RouteFilterSheet idle prefetch (EMİR 11)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let idleId = null;
    let timeoutId = null;

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(() => {
        import("../../components/RouteFilterSheet");
      });
    } else {
      timeoutId = window.setTimeout(() => {
        import("../../components/RouteFilterSheet");
      }, 2000);
    }

    return () => {
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Harita pin’inden seçim geldiğinde kartı seç
  const handleSelectRouteFromMap = useCallback((routeId) => {
    if (!routeId) return;
    setSelectedRouteId(String(routeId));
  }, []);

  // EMİR 8: "Bu alanda ara" CTA'sı → useRoutesData.resetAll
  const handleSearchAreaFromMap = useCallback(() => {
    if (resetDataStateRef.current) {
      resetDataStateRef.current();
    }
  }, []);

  // Yakınımda/harita hook’u
  const nearController = useNearMapController({
    sort,
    hasSearch,
    initialNear: initialRef.current.ui.near,
    initialRadius: initialRef.current.ui.radius,
    // EMİR 13: Harita pin verisi artık gerçek rotalardan geliyor (itemsForMap)
    items: itemsForMap,
    selectedRouteId,
    onSelectRouteFromMap: handleSelectRouteFromMap,
    onViewportChange: setNearBounds,
    // EMİR 8: Bu alanda ara → veri katmanında resetAll
    onSearchArea: handleSearchAreaFromMap,
  });

  const {
    mapDivRef,
    mapRef,
    gmapsStatus,
    errorMsg,
    mapReady,
    near,
    radius,
    locationStatus,
    requestLocation,
    showSearchAreaButton,
    handleSearchInThisArea,
  } = nearController;

  // Veri katmanı hook’u (near/search/non-near + sentinel)
  const {
    items,
    visibleItems,
    totalCount,
    isEnd,
    loading,
    initialized,
    loadingSearch,
    sentinelRef,
    resetAll: resetDataState,
  } = useRoutesData({
    sort,
    audience,
    filters,
    followingUids,
    hasSearch,
    debouncedQuery,
    nearBounds,
    near,
    onBumpRecentQuery: bumpRecentQuery,
  });

  // EMİR 8: "Bu alanda ara" callback'i için resetAll referansını güncel tut
  useEffect(() => {
    resetDataStateRef.current = resetDataState;
  }, [resetDataState]);

  // EMİR 13: Yakınımda modundayken haritaya gidecek pin snapshot’ını güncelle
  useEffect(() => {
    if (sort === "near" && !hasSearch) {
      setItemsForMap(items);
    } else {
      setItemsForMap([]);
    }
  }, [items, sort, hasSearch]);

  // unmount temizliği (toast timer)
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  // Modal kapandığında seçim temizlensin
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleRouteClose = () => {
      setSelectedRouteId(null);
    };

    window.addEventListener("close-route-modal", handleRouteClose);
    window.addEventListener("route-modal-closed", handleRouteClose);

    return () => {
      window.removeEventListener("close-route-modal", handleRouteClose);
      window.removeEventListener("route-modal-closed", handleRouteClose);
    };
  }, []);

  // Audience: Hepsi/Takip → takip edilen kullanıcılar
  useEffect(() => {
    if (audience !== "following") {
      setFollowingUids([]);
      return;
    }
    const viewerId = auth?.currentUser?.uid;
    if (!viewerId) {
      setFollowingUids([]);
      return;
    }

    let alive = true;
    getFollowingUids(viewerId)
      .then((uids) => {
        if (!alive) return;
        setFollowingUids(Array.isArray(uids) ? uids : []);
      })
      .catch(() => {
        if (!alive) return;
        setFollowingUids([]);
      });

    return () => {
      alive = false;
    };
  }, [audience]);

  // Arama kutusuna yazınca Yakınımda ↔ En yeni geçişi
  useEffect(() => {
    const hasText = !!searchText.trim();
    if (hasText) {
      if (!wasSearchingRef.current && sort === "near") {
        setSort("new");
      }
      wasSearchingRef.current = true;
      return;
    }
    if (!hasText && wasSearchingRef.current) {
      if (sort !== "near") {
        setSort("near");
      }
      wasSearchingRef.current = false;
    }
  }, [searchText, sort]);

  // Seçilen rota değişince kartı ortala
  useEffect(() => {
    if (!selectedRouteId) return;
    const selId = String(selectedRouteId);
    const target = items.find((r) => String(r.id) === selId);
    if (!target) return;

    const el = cardRefs.current[selId];
    if (el && typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } catch {
        // no-op
      }
    }
  }, [selectedRouteId, items]);

  // FilterSheet apply
  const handleFilterApply = useCallback((payload) => {
    setFilters({
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      city: payload.city || "",
      country: payload.country || "",
      dist: payload.dist || [0, 50],
      dur: payload.dur || [0, 300],
    });

    if (payload.groupBy) {
      setGroup(payload.groupBy);
    }
    if (payload.sort) {
      setSort(payload.sort);
    }
  }, []);

  // Tüm filtreleri resetle
  const handleResetAll = useCallback(() => {
    resetDataState();
    setFilters({
      tags: [],
      city: "",
      country: "",
      dist: [0, 50],
      dur: [0, 300],
    });
    setGroup(DEFAULT_GROUP);
    setAudience(DEFAULT_AUDIENCE);
    setSort(DEFAULT_SORT);
    setSelectedRouteId(null);
    // near/radius useNearMapController içinde LS değerlerine geri döner
  }, [resetDataState]);

  // Kart tıklama
  const handleRouteCardClick = useCallback(
    (route) => {
      if (!route || !route.id) return;
      const id = String(route.id);
      setSelectedRouteId(id);

      if (
        sort === "near" &&
        mapReady &&
        mapRef.current &&
        route?.routeGeo?.center &&
        Number.isFinite(route.routeGeo.center.lat) &&
        Number.isFinite(route.routeGeo.center.lng)
      ) {
        try {
          mapRef.current.panTo({
            lat: route.routeGeo.center.lat,
            lng: route.routeGeo.center.lng,
          });
        } catch {
          // no-op
        }
      }

      try {
        window.dispatchEvent(
          new CustomEvent("open-route-modal", {
            detail: {
              routeId: id,
              route,
              source: hasSearch
                ? "search"
                : sort === "near"
                ? "near"
                : "explore",
            },
          })
        );
      } catch {
        // no-op
      }
    },
    [sort, mapReady, mapRef, hasSearch]
  );

  const hasActiveFilters =
    !!filters.city ||
    !!filters.country ||
    (filters.tags && filters.tags.length > 0);

  // Gruplar (EMİR 11)
  const groups = useMemo(
    () => makeGroups(visibleItems, group),
    [visibleItems, group]
  );

  // EMİR 12: windowing için düz index haritası
  const { flatIndexById, totalItemCount } = useMemo(() => {
    const map = new Map();
    let idx = 0;
    for (const g of groups) {
      for (const r of g.items) {
        const id =
          r && r.id !== undefined && r.id !== null ? String(r.id) : null;
        if (!id) {
          idx += 1;
          continue;
        }
        if (!map.has(id)) {
          map.set(id, idx);
        }
        idx += 1;
      }
    }
    return { flatIndexById: map, totalItemCount: idx };
  }, [groups]);

  const windowingDisabled = !!selectedRouteId || totalItemCount <= 40;

  const { start: windowStart, end: windowEnd } = useWindowedList({
    containerRef: listContainerRef,
    itemCount: totalItemCount,
    estimatedItemHeight: 96,
    overscan: 6,
    disabled: windowingDisabled,
  });

  const showNearbyPrompt =
    sort === "near" && !hasSearch && !near && locationStatus === "denied";

  const groupLabel =
    group === "city" ? "Şehir" : group === "country" ? "Ülke" : "";

  const nearMetaText =
    sort === "near" && !hasSearch && initialized
      ? `${totalCount} rota${
          Number.isFinite(radius) && radius > 0
            ? ` • yaklaşık ${radius.toFixed(1)} km`
            : ""
        }`
      : "";

  const showFollowingNearEmptyBadge =
    sort === "near" &&
    !hasSearch &&
    audience === "following" &&
    initialized &&
    !loading &&
    totalCount === 0 &&
    !showNearbyPrompt;

  const emptyMessage =
    audience === "following"
      ? hasSearch
        ? "Takip ettiklerinden bu arama için rota bulunamadı."
        : sort === "near"
        ? "Takip ettiklerinden yakında rota yok."
        : "Takip ettiklerinden uygun rota bulunamadı."
      : hasSearch
      ? "Aramana uygun rota bulunamadı."
      : "Hiç rota bulunamadı.";

  return (
    <div
      className="RoutesExploreMobile"
      style={{
        padding: "0 0 80px",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      {/* Katman 1 — Sticky toolbar */}
      <header
        className="routes-toolbar"
        role="region"
        aria-label="Rotalar araç çubuğu"
      >
        <div className="routes-toolbar-title">Rotalar</div>
        <div className="routes-toolbar-segment">
          <div className="routes-segment" aria-label="Kapsam">
            <button
              type="button"
              className={
                "routes-segment-btn" +
                (audience === "all" ? " routes-segment-btn--active" : "")
              }
              onClick={() => setAudience("all")}
              aria-pressed={audience === "all"}
            >
              Hepsi
            </button>
            <button
              type="button"
              className={
                "routes-segment-btn" +
                (audience === "following"
                  ? " routes-segment-btn--active"
                  : "")
              }
              onClick={() => {
                if (!auth?.currentUser?.uid) {
                  setAudience("all");
                  const msg =
                    "Takip ettiğin kullanıcıların rotalarını görmek için giriş yapmalısın.";
                  setToastMessage(msg);
                  if (toastTimerRef.current) {
                    clearTimeout(toastTimerRef.current);
                  }
                  toastTimerRef.current = window.setTimeout(() => {
                    setToastMessage("");
                  }, 2600);
                  return;
                }
                setAudience("following");
              }}
              aria-pressed={audience === "following"}
            >
              Takip
            </button>
          </div>
        </div>
        <button
          type="button"
          className="routes-filter-btn"
          onClick={() => setFilterSheetOpen(true)}
        >
          Sırala
        </button>
      </header>

      {/* Katman 1.5 — Arama kutusu + son aramalar */}
      <SearchBarMobile
        searchText={searchText}
        onChange={setSearchText}
        loadingSearch={loadingSearch}
        showRecentList={showRecentList}
        recentQueries={recentQueries}
        onFocus={handleSearchFocus}
        onBlur={handleSearchBlur}
        onKeyDown={handleSearchKeyDown}
        onClear={clearSearch}
        onRecentClick={handleRecentClick}
        onRecentClear={handleRecentClearClick}
      />

      {/* Katman 2 — Tek satır chip şeridi */}
      <div className="routes-chiprow" aria-label="Rota sıralama seçenekleri">
        <button
          type="button"
          className={"chip" + (sort === "near" ? " chip--active" : "")}
          onClick={() => setSort("near")}
          aria-pressed={sort === "near"}
          aria-current={sort === "near" ? "true" : undefined}
        >
          Yakınımda
        </button>
        <button
          type="button"
          className={"chip" + (sort === "new" ? " chip--active" : "")}
          onClick={() => setSort("new")}
          aria-pressed={sort === "new"}
          aria-current={sort === "new" ? "true" : undefined}
        >
          En yeni
        </button>
        <button
          type="button"
          className={"chip" + (sort === "likes" ? " chip--active" : "")}
          onClick={() => setSort("likes")}
          aria-pressed={sort === "likes"}
          aria-current={sort === "likes" ? "true" : undefined}
        >
          En çok oy
        </button>
        <button
          type="button"
          className={"chip" + (sort === "rating" ? " chip--active" : "")}
          onClick={() => setSort("rating")}
          aria-pressed={sort === "rating"}
          aria-current={sort === "rating" ? "true" : undefined}
        >
          En yüksek puan
        </button>

        {groupLabel && (
          <button
            type="button"
            className="routes-badge"
            onClick={() => setFilterSheetOpen(true)}
          >
            Grup: {groupLabel}
          </button>
        )}
      </div>

      {/* Takip + Yakınımda + 0 sonuç bilgisi */}
      {showFollowingNearEmptyBadge && (
        <div
          className="routes-info-row"
          style={{
            padding: "4px 10px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "#4b5563",
          }}
        >
          <span className="routes-badge">
            Takip ettiklerinden yakında rota yok.
          </span>
          <button
            type="button"
            className="routes-info-link"
            onClick={() => setAudience("all")}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              marginLeft: "auto",
              fontSize: 11,
              fontWeight: 500,
              color: "#1d4ed8",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Hepsi&rsquo;ne geç
          </button>
        </div>
      )}

      {/* Yakınımda: konum izni reddedildiyse prompt */}
      {showNearbyPrompt && (
        <NearbyPromptMobile
          onAllow={requestLocation}
          onCancel={() => setSort("new")}
        />
      )}

      {/* Yakınımda: meta + harita alanı (lazy load) */}
      {sort === "near" && !hasSearch && !showNearbyPrompt && (
        <>
          <Suspense
            fallback={
              <>
                {nearMetaText && (
                  <div
                    style={{
                      padding: "4px 10px 0",
                      fontSize: 11,
                      color: "#6b7280",
                    }}
                  >
                    {nearMetaText}
                  </div>
                )}
                <div
                  className="near-mapWrap"
                  style={{
                    height: 300,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#f1f3f4",
                    margin: "4px 10px 8px",
                    position: "relative",
                  }}
                >
                  <div
                    className="near-skel"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 37%,#f3f4f6 63%)",
                      animation: "near-skel-pulse 1.4s ease infinite",
                    }}
                  />
                </div>
              </>
            }
          >
            <NearMapPane
              mapDivRef={mapDivRef}
              gmapsStatus={gmapsStatus}
              errorMsg={errorMsg}
              mapError={nearController.mapError}
              reloadMap={nearController.reloadMap}
              nearMetaText={nearMetaText}
              showSearchAreaButton={showSearchAreaButton}
              onSearchAreaClick={handleSearchInThisArea}
            />
          </Suspense>

          {hasActiveFilters && (
            <div
              className="near-filters-row"
              style={{
                padding: "0 10px 8px",
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {filters.city && (
                <span className="chip chip--filter">
                  Şehir: {filters.city}
                </span>
              )}
              {filters.country && (
                <span className="chip chip--filter">
                  Ülke: {filters.country}
                </span>
              )}
              {filters.tags &&
                filters.tags.map((t) => (
                  <span key={t} className="chip chip--filter">
                    #{t}
                  </span>
                ))}
            </div>
          )}
        </>
      )}

      {/* Arama modu için sonuç meta bilgisi */}
      {hasSearch && initialized && (
        <div className="routes-results-meta">
          <span className="routes-results-title">Sonuçlar</span>
          <span className="routes-results-count">{totalCount} sonuç</span>
        </div>
      )}

      {/* Liste alanı */}
      <div
        aria-busy={loading && !initialized}
        style={{ paddingTop: 4, paddingInline: 10 }}
        ref={listContainerRef}
      >
        {!initialized && !loading && (
          <div style={{ padding: "20px 4px" }}>Yükleniyor…</div>
        )}

        {initialized && !visibleItems.length && !loading && (
          <div
            style={{
              padding: "14px 4px",
              opacity: 0.8,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{emptyMessage}</span>
            <button
              type="button"
              onClick={handleResetAll}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                fontSize: 12,
                fontWeight: 500,
                color: "#1d4ed8",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Filtreleri temizle
            </button>
          </div>
        )}

        {/* Near modunda ilk yükleme sırasında skeleton kartlar */}
        {sort === "near" &&
          !hasSearch &&
          loading &&
          !visibleItems.length && (
            <div style={{ padding: "8px 2px" }}>
              <div
                className="near-skel"
                style={{
                  height: 80,
                  marginBottom: 8,
                  borderRadius: 12,
                  background: "#f3f4f6",
                }}
              />
              <div
                className="near-skel"
                style={{
                  height: 80,
                  marginBottom: 8,
                  borderRadius: 12,
                  background: "#f3f4f6",
                }}
              />
              <div
                className="near-skel"
                style={{
                  height: 80,
                  marginBottom: 8,
                  borderRadius: 12,
                  background: "#f3f4f6",
                }}
              />
            </div>
          )}

        {/* EMİR 12: Hafif windowing – pencere dışındaki kartlar boş blok olarak kalıyor */}
        {groups.map((g) => (
          <section
            key={g.key}
            className="ExploreGroup"
            style={{ marginBottom: 8 }}
          >
            {g.label && (
              <header
                className="ExploreGroupHeader"
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                  background: "#fff",
                  padding: "4px 2px 4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span
                  className="ExploreGroupHeaderTitle"
                  style={{ fontSize: 13, fontWeight: 700 }}
                >
                  {g.label}
                </span>
                <span
                  className="ExploreGroupHeaderBadge"
                  style={{
                    minWidth: 22,
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "#f3f4f6",
                    fontSize: 11,
                    textAlign: "center",
                  }}
                >
                  {g.items.length}
                </span>
              </header>
            )}
            <div
              className="ExploreGroupBody"
              style={{ paddingTop: g.label ? 6 : 0 }}
            >
              {g.items.map((r) => {
                const id =
                  r && r.id !== undefined && r.id !== null ? String(r.id) : "";
                const flatIndex =
                  id && flatIndexById.has(id)
                    ? flatIndexById.get(id)
                    : 0;

                const shouldRenderCard =
                  windowingDisabled ||
                  (flatIndex >= windowStart && flatIndex < windowEnd);

                const selected =
                  !!selectedRouteId &&
                  String(selectedRouteId) === String(r.id);

                return (
                  <div
                    key={r.id}
                    style={{
                      marginBottom: 8,
                      minHeight: 88, // yaklaşık kart yüksekliği
                    }}
                  >
                    {shouldRenderCard && (
                      <div
                        ref={(el) => {
                          if (!id) return;
                          if (!el) {
                            delete cardRefs.current[id];
                          } else {
                            cardRefs.current[id] = el;
                          }
                        }}
                      >
                        <RouteCardMobile
                          route={r}
                          selected={selected}
                          onClick={() => handleRouteCardClick(r)}
                          highlightQuery={
                            hasSearch ? debouncedQuery : ""
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Sonsuz kaydırma sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        {/* Alt yükleme durumu */}
        {loading && sort !== "near" && visibleItems.length > 0 && (
          <div
            style={{
              padding: 12,
              textAlign: "center",
              opacity: 0.65,
              fontSize: 13,
            }}
          >
            Yükleniyor…
          </div>
        )}
        {isEnd && !loading && items.length > 0 && (
          <div
            style={{
              padding: 12,
              textAlign: "center",
              opacity: 0.6,
              fontSize: 12,
            }}
          >
            Hepsi bu kadar.
          </div>
        )}
      </div>

      {/* Alt çekmece filtre sheet – lazy + Suspense (EMİR 11) */}
      {filterSheetOpen && (
        <Suspense fallback={null}>
          <RouteFilterSheetLazy
            open={filterSheetOpen}
            initial={{
              tagsText: (filters.tags || []).join(" "),
              city: filters.city,
              country: filters.country,
              dist: filters.dist,
              dur: filters.dur,
              sort,
              groupBy: group,
            }}
            onApply={handleFilterApply}
            onClose={() => setFilterSheetOpen(false)}
          />
        </Suspense>
      )}

      {/* Giriş yapılmadan Takip’e geçme denemesi için küçük toast */}
      {toastMessage && <div className="explore-toast">{toastMessage}</div>}
    </div>
  );
}

// HIZLI TEST (EMİR #1–5 + 8 + 9 + 10 + 11 + 12 + 13)
// [ ] Proje build oluyor, RoutesExploreMobile import hatası yok.
// [ ] Mobil “Rotalar” sekmesi açılıyor, Hepsi/Takip ve Yakınımda/En yeni/En çok oy/En yüksek puan eskisi gibi çalışıyor.
// [ ] Arama kutusu: yazınca ~300ms sonra arıyor, Enter’a basınca anında arıyor, ESC aramayı temizliyor.
// [ ] Son aramalar (r_recentq) listesi çalışıyor, yeni aramalar listeye ekleniyor.
// [ ] Yakınımda: Harita yükleniyor, konum izni prompt’u çıkıyor, pin/kart senkronu ve “Bu alanda ara” butonu çalışıyor.
//     → Haritada yeni bir alana kaydır/zoom yap, CTA çıksın; tıklayınca liste resetlenip yeni alana göre near sonuçları geliyor.
// [ ] Near/search/non-near veri akışları useRoutesData içinden yönetiliyor; sonsuz kaydırma sentinel üzerinden çalışıyor.
// [ ] Geri/ileri ile m/a/s/q/sel + groupBy/city/country/tags state’i doğru geri yükleniyor.
// [ ] “Hepsi bu kadar.” metni doğru yerde ve sadece verinin sonuna gelindiğinde çıkıyor.
// [ ] EMİR 9: Google Maps bundle’ı sadece Yakınımda modunda yükleniyor, listener sayısı artmıyor.
// [ ] EMİR 10: Sentinel rootMargin = "600px 0px 1200px 0px"; aynı cursor için çift istek yok; resetAll() sonrası ilk sayfa temiz yükleniyor.
// [ ] EMİR 11: RouteFilterSheet chunk’ı lazy-load; idle prefetch sonrası “Sırala” anında açılıyor; makeGroups memoize.
// [ ] EMİR 12: Büyük listelerde scroll sırasında sadece pencere içindeki kartlar gerçek <RouteCardMobile> olarak render ediliyor; pencere dışı kartlar boş blok olarak kalıyor (hafif windowing). Dupe-guard sayesinde aynı id’ye sahip rota iki kez görünmüyor.
// [ ] EMİR 13: Yakınımda modunda harita pinleri useRoutesData.items ile senkron (itemsForMap); chunked pin render + marker clusterer ile 200+ pin sahnesinde FPS stabil.

export default RoutesExploreMobile;
