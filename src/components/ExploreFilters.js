// src/components/ExploreFilters.js
// Sıralama + serbest metin şehir/ülke girişleri. Değiştikçe onChange çağırır.

import React, { useEffect, useState } from "react";

export default function ExploreFilters({
  value = { order: "trending", city: "", countryCode: "" },
  onChange = () => {},
}) {
  const [order, setOrder] = useState(value.order || "trending");
  const [city, setCity] = useState(value.city || "");
  const [country, setCountry] = useState(value.countryCode || "");

  // Değişiklikleri üst bileşene aktar
  useEffect(() => {
    const t = setTimeout(() => {
      onChange({ order, city: city.trim(), countryCode: country.trim().toUpperCase() });
    }, 300);
    return () => clearTimeout(t);
  }, [order, city, country, onChange]);

  const reset = () => {
    setOrder("trending");
    setCity("");
    setCountry("");
    onChange({ order: "trending", city: "", countryCode: "" });
  };

  const pill = (active) => ({
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#111",
    fontWeight: 800,
    cursor: "pointer",
  });

  const wrap = {
    display: "grid",
    gap: 8,
    padding: "10px",
    borderBottom: "1px solid #eee",
    background: "#fff",
    position: "sticky",
    top: 0,
    zIndex: 5,
  };

  const row = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
  const input = {
    flex: "1 1 0",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    fontSize: 14,
  };
  const resetBtn = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  };

  return (
    <div style={wrap}>
      {/* Sıralama */}
      <div style={row} role="group" aria-label="Sıralama">
        <button style={pill(order === "trending")} onClick={() => setOrder("trending")}>Popüler</button>
        <button style={pill(order === "new")} onClick={() => setOrder("new")}>Yeni</button>
        <button style={pill(order === "top")} onClick={() => setOrder("top")}>En Yüksek</button>
      </div>

      {/* Filtreler */}
      <div style={row}>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Şehir (ör. Istanbul)"
          aria-label="Şehir"
          style={input}
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Ülke kodu (ör. TR)"
          aria-label="Ülke kodu"
          style={{ ...input, maxWidth: 160 }}
        />
        <button onClick={reset} style={resetBtn} title="Filtreleri temizle">Temizle</button>
      </div>
    </div>
  );
}
