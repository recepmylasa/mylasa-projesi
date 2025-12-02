// src/pages/RoutesExploreMobile/RoutesExploreMobile.jsx
// Keşif ekranı – Hepsi/Takip, Yakınımda/En yeni/En çok oy/En yüksek puan,
// arama (debounce + AbortController + son aramalar),
// URL/LocalStorage senkronu (m/a/s/q/sel + groupBy/city/country/tags),
// Yakınımda harita (Google Maps) + "Bu alanda ara" CTA + pin↔kart senkronu,
// near/search/non-near veri akışı ve sonsuz kaydırma (useRoutesData).

import React, { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "../../firebase";

import { getFollowingUids } from "../../services/follows";

import NearbyPromptMobile from "../../components/NearbyPromptMobile";
import RouteCardMobile from "../../components/RouteCardMobile";
import RouteFilterSheet from "../../components/RouteFilterSheet";

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

import SearchBarMobile from "./components/SearchBarMobile";
import NearMapPane from "./components/NearMapPane";
import EmptyStateMobile from "./components/EmptyStateMobile";

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

  // open-route-modal event’i
  const openRoute = useCallback((routeId) => {
    if (!routeId) return;
    try {
      window.dispatchEvent(
        new CustomEvent("open-route-modal", {
          detail: { routeId },
        })
      );
    } catch {
      // no-op
    }
  }, []);

  // Harita pin’inden seçim geldiğinde kartı seç
  const handleSelectRouteFromMap = useCallback((routeId) => {
    if (!routeId) return;
    setSelectedRouteId(String(routeId));
  }, []);

  // Yakınımda/harita hook’u
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
  } = useNearMapController({
    sort,
    hasSearch,
    initialNear: initialRef.current.ui.near,
    initialRadius: initialRef.current.ui.radius,
    items: [], // marker verisi useRoutesData’den bağımsız; nearMapPins kendi snapshot’ını kullanıyor
    selectedRouteId,
    onSelectRouteFromMap: handleSelectRouteFromMap,
    onViewportChange: setNearBounds,
    // onSearchArea: gerekirse ileride kullanılabilir
  });

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

      openRoute(id);
    },
    [sort, mapReady, mapRef, openRoute]
  );

  const hasActiveFilters =
    !!filters.city ||
    !!filters.country ||
    (filters.tags && filters.tags.length > 0);

  const groups = makeGroups(visibleItems, group);

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

  const isEmptyState =
    initialized && !visibleItems.length && !loading && !showNearbyPrompt;

  const emptyTitle = hasSearch
    ? "Sonuç bulunamadı"
    : audience === "following"
    ? "Takiplerinde uygun rota yok"
    : "Rota bulunamadı";

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
      <div
        className="routes-chiprow"
        aria-label="Rota sıralama seçenekleri"
      >
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

      {/* Yakınımda: meta + harita alanı */}
      {sort === "near" && !hasSearch && !showNearbyPrompt && (
        <>
          <NearMapPane
            mapDivRef={mapDivRef}
            gmapsStatus={gmapsStatus}
            errorMsg={errorMsg}
            nearMetaText={nearMetaText}
            showSearchAreaButton={showSearchAreaButton}
            onSearchAreaClick={handleSearchInThisArea}
          />

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
      >
        {!initialized && !loading && (
          <div style={{ padding: "20px 4px" }}>Yükleniyor…</div>
        )}

        {isEmptyState && (
          <EmptyStateMobile
            title={emptyTitle}
            description={emptyMessage}
            primaryLabel="Filtreleri temizle"
            onPrimary={handleResetAll}
          />
        )}

        {/* Near modunda ilk yükleme sırasında skeleton kartlar */}
        {sort === "near" && !hasSearch && loading && !visibleItems.length && (
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
              {g.items.map((r) => (
                <div
                  key={r.id}
                  style={{ marginBottom: 8 }}
                  ref={(el) => {
                    if (!el) {
                      delete cardRefs.current[r.id];
                    } else {
                      cardRefs.current[r.id] = el;
                    }
                  }}
                >
                  <RouteCardMobile
                    route={r}
                    selected={
                      !!selectedRouteId &&
                      String(selectedRouteId) === String(r.id)
                    }
                    onClick={() => handleRouteCardClick(r)}
                    highlightQuery={hasSearch ? debouncedQuery : ""}
                  />
                </div>
              ))}
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

      {/* Alt çekmece filtre sheet */}
      <RouteFilterSheet
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

      {/* Giriş yapılmadan Takip’e geçme denemesi için küçük toast */}
      {toastMessage && (
        <div className="explore-toast">{toastMessage}</div>
      )}
    </div>
  );
}

// HIZLI TEST (EMİR #1–8)
// [ ] Proje build oluyor, RoutesExploreMobile import hatası yok.
// [ ] Mobil “Rotalar” sekmesi açılıyor, Hepsi/Takip ve Yakınımda/En yeni/En çok oy/En yüksek puan eskisi gibi çalışıyor.
// [ ] Arama kutusu: yazınca ~300ms sonra arıyor, Enter’a basınca anında arıyor, ESC aramayı temizliyor.
// [ ] Son aramalar (r_recentq) listesi çalışıyor, yeni aramalar listeye ekleniyor.
// [ ] Yakınımda: Harita yükleniyor, konum izni prompt’u çıkıyor, pin/kart senkronu ve “Bu alanda ara” butonu çalışıyor.
// [ ] Near/search/non-near veri akışları useRoutesData içinden yönetiliyor; sonsuz kaydırma sentinel üzerinden çalışıyor.
// [ ] Geri/ileri ile m/a/s/q/sel + groupBy/city/country/tags state’i doğru geri yükleniyor.
// [ ] “Hepsi bu kadar.” metni doğru yerde ve sadece verinin sonuna gelindiğinde çıkıyor.
// [ ] 0 sonuç durumlarında EmptyStateMobile tek tip görsel dil ile çıkıyor; “Filtreleri temizle” butonu resetAll çağırıyor.
// [ ] Harita hata durumunda (gmapsStatus === "error" | "no-key") ErrorStateMobile gösteriliyor.
// [ ] Konum reddinde (Yakınımda + izin yok) yalnız NearbyPromptMobile görünüyor; boş state ile çakışmıyor.

export default RoutesExploreMobile;
