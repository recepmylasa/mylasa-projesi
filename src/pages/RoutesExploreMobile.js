// src/pages/RoutesExploreMobile.js
// Public + finished rotaları filtreyle listeler; sonsuz kaydırma (20’lik).
// Kart tık → /r/:id + 'open-route-modal' event.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { searchRoutes } from "../services/routeSearch";
import RouteFilterSheet from "../components/RouteFilterSheet";
import RouteCardMobile from "../components/RouteCardMobile";
import { getCityCountry } from "../services/reverseGeocode";

export default function RoutesExploreMobile() {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [end, setEnd] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [filters, setFilters] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const tags = (p.get("tags") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 10);
    const city = p.get("city") || "";
    const country = p.get("country") || "";
    const dist = [Number(p.get("dmin") || 0), Number(p.get("dmax") || 50)];
    const dur  = [Number(p.get("tmin") || 0), Number(p.get("tmax") || 300)];
    const sort = p.get("sort") || "new";
    return { tags, city, country, dist, dur, sort };
  });

  // Nearby için kullanıcı lokasyonu (isteğe bağlı)
  const nearRef = useRef(null);
  useEffect(() => {
    if (filters.sort !== "nearby") return;
    const geoOpts = { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 };
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      try {
        const area = await getCityCountry(lat, lng);
        nearRef.current = { lat, lng, city: area.city || "" };
      } catch {
        nearRef.current = { lat, lng };
      }
    }, () => {}, geoOpts);
  }, [filters.sort]);

  const applyToUrl = (f) => {
    const p = new URLSearchParams();
    if (f.tags?.length) p.set("tags", f.tags.join(","));
    if (f.city) p.set("city", f.city);
    if (f.country) p.set("country", f.country);
    if (Array.isArray(f.dist)) { p.set("dmin", String(f.dist[0])); p.set("dmax", String(f.dist[1])); }
    if (Array.isArray(f.dur))  { p.set("tmin", String(f.dur[0]));  p.set("tmax", String(f.dur[1])); }
    if (f.sort) p.set("sort", f.sort);
    const url = p.toString() ? `/explore/routes?${p.toString()}` : `/explore/routes`;
    window.history.replaceState({}, "", url);
  };

  const resetAndLoad = useCallback(async (fresh) => {
    setLoading(true); setEnd(false); setItems([]); setCursor(null);
    try {
      const res = await searchRoutes({
        tags: fresh.tags, city: fresh.city, country: fresh.country,
        distRange: fresh.dist, durRange: fresh.dur, sort: fresh.sort,
        near: nearRef.current || null,
      });
      setItems(res.items); setCursor(res.nextCursor);
      if (!res.nextCursor || res.items.length < 20) setEnd(true);
    } catch (e) {
      console.error(e);
      setItems([]); setCursor(null); setEnd(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { applyToUrl(filters); resetAndLoad(filters); /* eslint-disable-next-line */ }, []);

  const loadMore = useCallback(async () => {
    if (loading || end || !cursor) return;
    setLoading(true);
    try {
      const res = await searchRoutes({
        tags: filters.tags, city: filters.city, country: filters.country,
        distRange: filters.dist, durRange: filters.dur, sort: filters.sort,
        cursor, near: nearRef.current || null,
      });
      setItems(prev => [...prev, ...res.items]);
      setCursor(res.nextCursor);
      if (!res.nextCursor || res.items.length < 20) setEnd(true);
    } catch (e) {
      console.error(e); setEnd(true);
    } finally { setLoading(false); }
  }, [cursor, end, filters, loading]);

  const handleApplyFilters = (f) => {
    const next = {
      tags: f.tags || [], city: f.city || "", country: f.country || "",
      dist: f.dist || [0, 50], dur: f.dur || [0, 300], sort: f.sort || "new",
    };
    setFilters(next); applyToUrl(next); resetAndLoad(next);
  };

  const handleOpenRoute = (route) => {
    if (!route?.id) return;
    const url = `/r/${route.id}`;
    window.history.pushState({}, "", url);
    try { window.dispatchEvent(new CustomEvent("open-route-modal", { detail: { routeId: route.id } })); } catch {}
  };

  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#fff",
                    borderBottom: "1px solid #eee", padding: "10px 12px",
                    display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Rotalar</h2>
        <button
          onClick={() => setSheetOpen(true)}
          style={{ marginLeft: "auto", background: "#111", color: "#fff",
                   border: "none", borderRadius: 10, padding: "8px 12px", fontWeight: 800, cursor: "pointer" }}
        >
          Filtrele
        </button>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        {items.map((r) => (
          <RouteCardMobile key={r.id} route={r} onClick={() => handleOpenRoute(r)} />
        ))}

        {!loading && items.length === 0 && (
          <div style={{ textAlign: "center", color: "#666", padding: "20px 0" }}>Gösterilecek rota yok.</div>
        )}
        {loading && (
          <div style={{ textAlign: "center", color: "#666", padding: "16px 0" }}>Yükleniyor…</div>
        )}
        {!end && !loading && items.length > 0 && (
          <button
            onClick={loadMore}
            style={{ margin: "10px auto 28px", display: "block",
                     background: "#f3f4f6", border: "1px solid #e5e7eb",
                     borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Daha fazla
          </button>
        )}
      </div>

      <RouteFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onApply={handleApplyFilters}
        initial={{
          tagsText: (filters.tags || []).join(", "),
          city: filters.city, country: filters.country,
          dist: filters.dist, dur: filters.dur, sort: filters.sort,
        }}
      />
    </div>
  );
}
