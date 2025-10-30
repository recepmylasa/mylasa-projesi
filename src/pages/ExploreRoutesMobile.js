// Keşfet: public+finished rotalar; sıralama/filtre + sonsuz kaydırma
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExploreFilters from "../components/ExploreFilters";
import RouteCardMobile from "../components/RouteCardMobile";
import { fetchPublicRoutes } from "../services/routeSearch";

/** Yardımcı: kullanıcı girişini sorguya uygun normalize et */
function normalizeCityForQuery(s = "") {
  const t = String(s).trim().toLowerCase();
  if (!t) return "";
  // her kelimenin baş harfini büyüt
  return t.replace(/\s+/g, " ").replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
function normalizeCountryCodeForQuery(s = "") {
  return String(s).trim().toUpperCase();
}

export default function ExploreRoutesMobile() {
  const [filters, setFilters] = useState({ order: "trending", city: "", countryCode: "" });
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [end, setEnd] = useState(false);
  const [didAutoFallback, setDidAutoFallback] = useState(false); // Popüler/En Yüksek boşsa 'Yeni'ye düş
  const sentinelRef = useRef(null);

  // Farklı bir filtre seçildiğinde otomatik düşüş hakkını sıfırla
  useEffect(() => {
    setDidAutoFallback(false);
  }, [filters.city, filters.countryCode, filters.order]);

  // İlk sayfa / filtre değiştikçe
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const cityQ = normalizeCityForQuery(filters.city);
        const ccQ = normalizeCountryCodeForQuery(filters.countryCode);

        const { items: first, nextCursor } = await fetchPublicRoutes({
          order: filters.order,
          city: cityQ,
          countryCode: ccQ,
          limit: 20,
          cursor: null,
        });

        if (!alive) return;

        // Popüler/En Yüksek boş dönerse otomatik "Yeni"ye düşelim (yalnızca bir kez)
        const noFilters = !cityQ && !ccQ;
        if (first.length === 0 && filters.order !== "new" && noFilters && !didAutoFallback) {
          setDidAutoFallback(true);
          setFilters((prev) => ({ ...prev, order: "new" }));
          return; // bu effect tekrar çalışacak
        }

        setItems(first);
        setCursor(nextCursor);
        setEnd(!nextCursor);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filters.order, filters.city, filters.countryCode, didAutoFallback]);

  // Sonsuz kaydırma
  useEffect(() => {
    if (end) return;
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loading || !cursor) return;

        setLoading(true);
        try {
          const cityQ = normalizeCityForQuery(filters.city);
          const ccQ = normalizeCountryCodeForQuery(filters.countryCode);

          const { items: more, nextCursor } = await fetchPublicRoutes({
            order: filters.order,
            city: cityQ,
            countryCode: ccQ,
            limit: 20,
            cursor,
          });
          setItems((prev) => prev.concat(more));
          setCursor(nextCursor);
          setEnd(!nextCursor);
        } finally {
          setLoading(false);
        }
      },
      { rootMargin: "1200px 0px 1400px 0px", threshold: 0.01 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loading, end, filters.order, filters.city, filters.countryCode]);

  const openRoute = useCallback((routeId) => {
    window.dispatchEvent(new CustomEvent("open-route-modal", { detail: { routeId } }));
  }, []);

  const grid = useMemo(() => {
    if (loading && items.length === 0) {
      return <div style={{ padding: 12, color: "#555" }}>Yükleniyor…</div>;
    }
    if (!loading && items.length === 0) {
      return <div style={{ padding: 12, color: "#777" }}>Hiç rota bulunamadı.</div>;
    }
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, padding: 8 }}>
          {items.map((r) => (
            <RouteCardMobile key={r.id} route={r} onClick={() => openRoute(r.id)} />
          ))}
        </div>
        {!end && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />}
        {loading && items.length > 0 && <div style={{ padding: 12, color: "#555" }}>Yükleniyor…</div>}
      </>
    );
  }, [items, loading, end, openRoute]);

  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      <ExploreFilters value={filters} onChange={setFilters} />
      {grid}
    </div>
  );
}
