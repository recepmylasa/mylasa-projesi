// src/pages/ExploreRoutesMobile.js
// Keşfet: public+finished rotalar; sıralama/filtre + sonsuz kaydırma

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExploreFilters from "../components/ExploreFilters";
import RouteCardMobile from "../components/RouteCardMobile";
import { fetchPublicRoutes } from "../services/routeSearch";

export default function ExploreRoutesMobile() {
  const [filters, setFilters] = useState({ order: "trending", city: "", countryCode: "" });
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [end, setEnd] = useState(false);
  const sentinelRef = useRef(null);

  // İlk sayfa / filtre değiştikçe
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { items: first, nextCursor } = await fetchPublicRoutes({
          order: filters.order,
          city: filters.city,
          countryCode: filters.countryCode,
          limit: 20,
          cursor: null,
        });
        if (!alive) return;
        setItems(first);
        setCursor(nextCursor);
        setEnd(!nextCursor);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [filters.order, filters.city, filters.countryCode]);

  // Sonsuz kaydırma
  useEffect(() => {
    if (end) return;
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (loading || !cursor) return;
      setLoading(true);
      try {
        const { items: more, nextCursor } = await fetchPublicRoutes({
          order: filters.order,
          city: filters.city,
          countryCode: filters.countryCode,
          limit: 20,
          cursor,
        });
        setItems((prev) => prev.concat(more));
        setCursor(nextCursor);
        setEnd(!nextCursor);
      } finally {
        setLoading(false);
      }
    }, { rootMargin: "1200px 0px 1400px 0px", threshold: 0.01 });

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
        {loading && items.length > 0 && (
          <div style={{ padding: 12, color: "#555" }}>Yükleniyor…</div>
        )}
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
