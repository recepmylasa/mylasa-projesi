// src/pages/RoutesExploreMobile.js
// Keşfet (Rotalar) — public & finished listesi + filtre/sıralama + sonsuz kaydırma
// Not: Servis importu fetchPublicRoutes olmalı (searchRoutes DEĞİL)

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchPublicRoutes } from "../services/routeSearch"; // ← doğru export
import ExploreFilters from "../components/ExploreFilters";

function RoutesExploreMobile() {
  // Filtreler
  const [order, setOrder] = useState("trending"); // trending | new | top
  const [city, setCity] = useState("");
  const [countryCode, setCountryCode] = useState("");

  // Liste durumu
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const sentinelRef = useRef(null);
  const inflightRef = useRef(null); // AbortController

  // Kart tık → mevcut modal açılır
  const openRoute = useCallback((routeId) => {
    if (!routeId) return;
    try {
      window.dispatchEvent(
        new CustomEvent("open-route-modal", { detail: { routeId } })
      );
    } catch {}
  }, []);

  // Filtre değişince ilk sayfayı çek
  const loadFirst = useCallback(async () => {
    // önce eski isteği iptal et
    try { inflightRef.current?.abort?.(); } catch {}
    const ac = new AbortController();
    inflightRef.current = ac;

    setLoading(true);
    setEnded(false);
    setCursor(null);
    setItems([]);

    try {
      const { items: page, nextCursor } = await fetchPublicRoutes({
        order,
        city: city?.trim() || undefined,
        countryCode: countryCode?.trim() || undefined,
        limit: 20,
        cursor: null,
        signal: ac.signal,
      });
      setItems(page || []);
      setCursor(nextCursor || null);
      setEnded(!nextCursor || (page || []).length === 0);
      setInitialized(true);
    } catch {
      // hata halinde boş göster
      setItems([]);
      setCursor(null);
      setEnded(true);
      setInitialized(true);
    } finally {
      if (inflightRef.current === ac) inflightRef.current = null;
      setLoading(false);
    }
  }, [order, city, countryCode]);

  // Devamını çek
  const loadMore = useCallback(async () => {
    if (loading || ended || !cursor) return;

    // önceki isteği iptal etme; ardışık yükleme
    setLoading(true);
    try {
      const { items: page, nextCursor } = await fetchPublicRoutes({
        order,
        city: city?.trim() || undefined,
        countryCode: countryCode?.trim() || undefined,
        limit: 20,
        cursor,
      });
      setItems((prev) => prev.concat(page || []));
      setCursor(nextCursor || null);
      setEnded(!nextCursor || (page || []).length === 0);
    } catch {
      // sayfa yüklenemediyse akışı bozma
    } finally {
      setLoading(false);
    }
  }, [order, city, countryCode, cursor, loading, ended]);

  // İlk yükleme + filtre değişimi
  useEffect(() => {
    loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, city, countryCode]);

  // Sonsuz kaydırma
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "800px 0px 1200px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // Filtre barı callback
  const handleFilters = useCallback(({ order, city, countryCode }) => {
    if (order) setOrder(order);
    setCity(city || "");
    setCountryCode(countryCode || "");
  }, []);

  const wrap = {
    maxWidth: 720,
    margin: "0 auto",
    padding: "8px 10px 80px",
  };
  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 10,
  };
  const card = {
    border: "1px solid #eee",
    borderRadius: 12,
    overflow: "hidden",
    background: "#fff",
    cursor: "pointer",
  };
  const thumb = {
    width: "100%",
    aspectRatio: "16/9",
    objectFit: "cover",
    background: "#f3f4f6",
    display: "block",
  };

  return (
    <div style={wrap}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: "4px 2px 8px" }}>
        Keşfet — Rotalar
      </h2>

      <ExploreFilters
        value={{ order, city, countryCode }}
        onChange={handleFilters}
      />

      {/* Liste */}
      {!initialized && (
        <div style={{ padding: "20px 8px" }}>Yükleniyor…</div>
      )}

      {initialized && items.length === 0 && !loading && (
        <div style={{ padding: "16px 8px", opacity: 0.7 }}>
          Hiç rota bulunamadı.
        </div>
      )}

      <div style={grid}>
        {items.map((r) => (
          <div
            key={r.id}
            style={card}
            onClick={() => openRoute(r.id)}
            title={r.title || "Rota"}
            role="button"
          >
            {/* Kapak */}
            {r.coverUrl ? (
              <img src={r.coverUrl} alt={r.title || "rota"} style={thumb} />
            ) : (
              <div style={thumb} />
            )}

            {/* Bilgi */}
            <div style={{ padding: "8px 10px" }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {r.title || "Rota"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                {typeof r.ratingAvg === "number"
                  ? `${r.ratingAvg.toFixed(1)} ★`
                  : "— ★"}
                {" · "}
                {Number(r.ratingCount || 0)} oy
              </div>
              {r.areas?.city || r.areas?.countryCode ? (
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                  {r.areas?.city ? r.areas.city : ""}{" "}
                  {r.areas?.countryCode ? `(${r.areas.countryCode})` : ""}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Sonsuz kaydırma sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />

      {/* Alt yükleme durumu */}
      {loading && items.length > 0 && (
        <div style={{ padding: 12, textAlign: "center", opacity: 0.65 }}>
          Yükleniyor…
        </div>
      )}
      {ended && items.length > 0 && (
        <div style={{ padding: 12, textAlign: "center", opacity: 0.5 }}>
          Hepsi bu kadar.
        </div>
      )}
    </div>
  );
}

export default RoutesExploreMobile;
