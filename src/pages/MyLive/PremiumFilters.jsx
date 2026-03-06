// FILE: src/pages/MyLive/PremiumFilters.jsx
import React, { useState } from "react";
import "../../styles/myLive.css";

const INTERESTS = [
  { emoji: "🎵", label: "Müzik" },
  { emoji: "🎮", label: "Oyun" },
  { emoji: "📚", label: "Kitap" },
  { emoji: "🏋️", label: "Spor" },
  { emoji: "🎨", label: "Sanat" },
  { emoji: "🌍", label: "Seyahat" },
  { emoji: "🍕", label: "Yemek" },
  { emoji: "📸", label: "Fotoğraf" },
  { emoji: "💻", label: "Teknoloji" },
  { emoji: "🎬", label: "Film" },
  { emoji: "🐾", label: "Hayvanlar" },
  { emoji: "🌱", label: "Doğa" },
];

const GENDERS = [
  { value: "all", label: "Hepsi" },
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
  { value: "other", label: "Diğer" },
];

export default function PremiumFilters({ initialFilters = {}, onSave, onBack }) {
  const [gender, setGender] = useState(initialFilters.gender ?? "all");
  const [ageMin, setAgeMin] = useState(initialFilters.ageMin ?? 18);
  const [ageMax, setAgeMax] = useState(initialFilters.ageMax ?? 99);
  const [interests, setInterests] = useState(initialFilters.interests ?? []);
  const [country, setCountry] = useState(initialFilters.country ?? "");

  const toggleInterest = (label) => {
    setInterests((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  };

  const handleSave = () => {
    onSave?.({ gender, ageMin: Number(ageMin), ageMax: Number(ageMax), interests, country });
  };

  return (
    <div className="mylive-filters">
      {/* Header */}
      <div className="mylive-filters-header">
        <button className="mylive-back-btn" onClick={onBack}>‹</button>
        <div className="mylive-filters-title">Premium Filtreler</div>
        <div className="mylive-premium-badge">👑 PRO</div>
      </div>

      {/* Cinsiyet */}
      <div className="mylive-filter-section">
        <div className="mylive-filter-label">Cinsiyet</div>
        <div className="mylive-gender-options">
          {GENDERS.map((g) => (
            <button
              key={g.value}
              className={`mylive-gender-btn ${gender === g.value ? "selected" : ""}`}
              onClick={() => setGender(g.value)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Yaş Aralığı */}
      <div className="mylive-filter-section" style={{ marginTop: 20 }}>
        <div className="mylive-filter-label">Yaş Aralığı</div>
        <div className="mylive-age-range">
          <input
            type="number"
            className="mylive-age-input"
            value={ageMin}
            min={18}
            max={99}
            onChange={(e) => setAgeMin(e.target.value)}
            placeholder="Min"
          />
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 18 }}>—</span>
          <input
            type="number"
            className="mylive-age-input"
            value={ageMax}
            min={18}
            max={99}
            onChange={(e) => setAgeMax(e.target.value)}
            placeholder="Max"
          />
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
          {ageMin} – {ageMax} yaş arası kullanıcılarla eşleş
        </div>
      </div>

      {/* İlgi Alanları */}
      <div className="mylive-filter-section" style={{ marginTop: 20 }}>
        <div className="mylive-filter-label">
          İlgi Alanları
          {interests.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "#00F2FF", fontWeight: 700 }}>
              {interests.length} seçili
            </span>
          )}
        </div>
        <div className="mylive-interests-grid">
          {INTERESTS.map((item) => (
            <button
              key={item.label}
              className={`mylive-interest-chip ${interests.includes(item.label) ? "selected" : ""}`}
              onClick={() => toggleInterest(item.label)}
            >
              {item.emoji} {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ülke */}
      <div className="mylive-filter-section" style={{ marginTop: 20 }}>
        <div className="mylive-filter-label">Ülke (İsteğe Bağlı)</div>
        <input
          type="text"
          className="mylive-age-input"
          style={{ width: "100%", textAlign: "left" }}
          placeholder="Örn: Türkiye"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
      </div>

      {/* Kaydet */}
      <button className="mylive-filter-save" onClick={handleSave}>
        Filtreleri Kaydet & Başla
      </button>

      {/* Reset */}
      <button
        onClick={() => { setGender("all"); setAgeMin(18); setAgeMax(99); setInterests([]); setCountry(""); }}
        style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 13, cursor: "pointer" }}
      >
        Filtreleri Sıfırla
      </button>
    </div>
  );
}
