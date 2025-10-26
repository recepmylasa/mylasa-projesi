// src/components/RouteFilterSheet.js
// Alt-sheet: filtreler. open/onClose/onApply ile kontrol edilir.

import React, { useEffect, useMemo, useState } from "react";

const row = { display: "flex", alignItems: "center", gap: 10, margin: "10px 0" };
const label = { width: 110, fontWeight: 700, fontSize: 13, color: "#111" };
const chipWrap = { display: "flex", flexWrap: "wrap", gap: 6 };
const chip = (active) => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid " + (active ? "#1a73e8" : "#ddd"),
  background: active ? "rgba(26,115,232,.1)" : "#fff",
  color: active ? "#1a73e8" : "#333",
  fontSize: 12,
  cursor: "pointer",
});
const rangeRow = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" };
const btn = { height: 40, borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 800, padding: "0 14px" };

export default function RouteFilterSheet({ open = false, initial = {}, onApply = () => {}, onClose = () => {} }) {
  const [tagsText, setTagsText] = useState(initial.tagsText || "");
  const [city, setCity] = useState(initial.city || "");
  const [country, setCountry] = useState(initial.country || "");
  const [dist, setDist] = useState(initial.dist || [0, 50]);
  const [dur, setDur] = useState(initial.dur || [0, 300]);
  const [sort, setSort] = useState(initial.sort || "new");

  useEffect(() => {
    if (!open) return;
    setTagsText(initial.tagsText || "");
    setCity(initial.city || "");
    setCountry(initial.country || "");
    setDist(initial.dist || [0, 50]);
    setDur(initial.dur || [0, 300]);
    setSort(initial.sort || "new");
  }, [open, initial]);

  const parsedTags = useMemo(() => tagsText.split(/[,\s]+/g).map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 10), [tagsText]);

  if (!open) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 3000, display: "flex", alignItems: "flex-end" }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "100%", maxHeight: "76vh", overflowY: "auto", background: "#fff",
                 borderTopLeftRadius: 16, borderTopRightRadius: 16, boxShadow: "0 -12px 32px rgba(0,0,0,.35)", padding: 14 }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <div style={{ height: 4, width: 44, background: "#ddd", borderRadius: 4, margin: "6px auto" }} />
        </div>

        <h3 style={{ margin: "4px 0 10px", fontSize: 18 }}>Filtreler</h3>

        <div style={row}>
          <div style={label}>Etiketler</div>
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="örn: müze, doğa"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
          />
        </div>
        {parsedTags.length > 0 && (
          <div style={{ ...row, marginTop: -4 }}>
            <div style={label} />
            <div style={chipWrap}>
              {parsedTags.map(t => (<span key={t} style={chip(true)}>#{t}</span>))}
            </div>
          </div>
        )}

        <div style={row}>
          <div style={label}>Şehir</div>
          <input
            type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="örn: Ankara"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
          />
        </div>

        <div style={row}>
          <div style={label}>Ülke</div>
          <input
            type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="TR ya da 'Türkiye'"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" }}
          />
        </div>

        <div style={row}>
          <div style={label}>Mesafe (km)</div>
          <div style={rangeRow}>
            <div>
              <small>Min: {dist[0]}</small>
              <input type="range" min={0} max={200} value={dist[0]} onChange={(e) => setDist([Number(e.target.value), dist[1]])} />
            </div>
            <div>
              <small>Maks: {dist[1]}</small>
              <input type="range" min={0} max={200} value={dist[1]} onChange={(e) => setDist([dist[0], Number(e.target.value)])} />
            </div>
          </div>
        </div>

        <div style={row}>
          <div style={label}>Süre (dk)</div>
          <div style={rangeRow}>
            <div>
              <small>Min: {dur[0]}</small>
              <input type="range" min={0} max={1000} value={dur[0]} onChange={(e) => setDur([Number(e.target.value), dur[1]])} />
            </div>
            <div>
              <small>Maks: {dur[1]}</small>
              <input type="range" min={0} max={1000} value={dur[1]} onChange={(e) => setDur([dur[0], Number(e.target.value)])} />
            </div>
          </div>
        </div>

        <div style={row}>
          <div style={label}>Sıralama</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              ["new", "Yeni"],
              ["top", "En yüksek puan"],
              ["popular", "En çok oy"],
              ["nearby", "Yakınımda"],
            ].map(([k, t]) => (
              <button key={k} onClick={() => setSort(k)} style={{ ...chip(sort === k), padding: "8px 12px", borderRadius: 12 }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button style={{ ...btn, background: "#eee", color: "#333", flex: 1 }} onClick={onClose}>Kapat</button>
          <button
            style={{ ...btn, background: "#1a73e8", color: "#fff", flex: 2 }}
            onClick={() => {
              onApply({ tags: parsedTags, city: city.trim(), country: country.trim(), dist, dur, sort });
              onClose();
            }}
          >Uygula</button>
        </div>
      </div>
    </div>
  );
}
