import React, { useState } from "react";
import "../../styles/myLive.css";

const INTERESTS = [
  "🎵 Müzik", "⚽ Spor", "💻 Teknoloji", "🎨 Sanat", "🎮 Oyun",
  "🎬 Film", "✈️ Seyahat", "🍕 Yemek", "👗 Moda", "📸 Fotoğraf",
  "📚 Kitap", "🧘 Yoga", "🌿 Doğa", "🎭 Tiyatro", "🏋️ Fitness",
];

const COUNTRIES = [
  "Türkiye", "Almanya", "İngiltere", "Amerika", "Fransa",
  "İtalya", "İspanya", "Japonya", "Güney Kore", "Brezilya",
];

export default function PremiumFilters({ initialFilters = {}, onSave, onBack, isDark = true }) {
  const [isPremium] = useState(false);
  const [filters, setFilters] = useState({
    ageMin: initialFilters.ageMin ?? 18,
    ageMax: initialFilters.ageMax ?? 50,
    gender: initialFilters.gender ?? "all",
    interests: initialFilters.interests ?? [],
    country: initialFilters.country ?? "",
  });

  const toggleInterest = (interest) => {
    if (!isPremium) {
      alert("Bu özellik Premium üyelere özeldir.");
      return;
    }
    setFilters((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleSave = () => {
    if (!isPremium) {
      alert("Filtreleri kaydetmek için Premium üye olun.");
      return;
    }
    localStorage.setItem("myLiveFilters", JSON.stringify(filters));
    onSave?.(filters);
    onBack?.();
  };

  const FilterLock = ({ locked }) => {
    if (!locked) return null;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "4px",
        padding: "2px 8px", borderRadius: "20px", fontSize: "10px", fontWeight: 700,
        background: "linear-gradient(135deg, rgba(200,50,255,0.2), rgba(100,50,255,0.2))",
        border: "1px solid rgba(200,50,255,0.3)",
        color: "rgba(200,50,255,1)",
      }}>
        🔒 Premium
      </div>
    );
  };

  const cardStyle = {
    background: isDark ? "rgba(18,20,30,0.7)" : "rgba(255,255,255,0.85)",
    border: isDark ? "1px solid rgba(0,242,255,0.08)" : "1px solid rgba(0,180,220,0.18)",
    borderRadius: "16px",
    padding: "16px",
    marginBottom: "12px",
    boxShadow: isDark ? "none" : "0 2px 10px rgba(0,0,0,0.07)",
  };

  const labelColor = isDark ? "rgba(180,190,220,0.6)" : "rgba(60,80,120,0.7)";
  const titleColor = isDark ? "#f0f4ff" : "#1a1a2e";

  return (
    <div style={{
      minHeight: "100dvh",
      background: isDark ? "#0a0b0f" : "#f0f4ff",
      color: isDark ? "#f0f4ff" : "#1a1a2e",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
      overflowY: "auto",
      position: "relative",
    }}>
      {/* Background */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(200,50,255,0.06) 0%, transparent 60%)",
      }} />

      <div style={{ position: "relative", maxWidth: "480px", margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <button
            onClick={onBack}
            style={{
              width: "36px", height: "36px", borderRadius: "12px",
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
              border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: "18px", color: titleColor,
            }}
          >
            ‹
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: titleColor, margin: 0 }}>Filtreler</h1>
            <p style={{ fontSize: "12px", color: labelColor, margin: "2px 0 0" }}>Eşleşme tercihlerini ayarla</p>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "6px 12px", borderRadius: "20px",
            background: "linear-gradient(135deg, rgba(200,50,255,0.2), rgba(100,50,255,0.2))",
            border: "1px solid rgba(200,50,255,0.3)",
          }}>
            <span style={{ fontSize: "14px" }}>👑</span>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(200,50,255,1)" }}>Premium</span>
          </div>
        </div>

        {/* Premium Banner */}
        {!isPremium && (
          <div style={{
            borderRadius: "16px", padding: "16px", marginBottom: "24px",
            background: "linear-gradient(135deg, rgba(200,50,255,0.12), rgba(100,50,255,0.12))",
            border: "1px solid rgba(200,50,255,0.25)",
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <div style={{ fontSize: "32px" }}>👑</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: titleColor, marginBottom: "4px" }}>
                Premium'a Yükselt
              </div>
              <div style={{ fontSize: "12px", color: labelColor }}>
                Gelişmiş filtreler ile ideal eşleşmeleri bul
              </div>
            </div>
            <button
              onClick={() => alert("Premium özelliği yakında!")}
              style={{
                padding: "8px 16px", borderRadius: "12px", border: "none",
                background: "linear-gradient(135deg, rgba(200,50,255,1), rgba(100,50,255,1))",
                color: "#ffffff", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Yükselt
            </button>
          </div>
        )}

        {/* Age Range */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>⚙️</span>
              <span style={{ fontSize: "14px", fontWeight: 700, color: titleColor }}>Yaş Aralığı</span>
            </div>
            <FilterLock locked={!isPremium} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#00f2ff" }}>{filters.ageMin}</span>
            <div style={{ flex: 1, textAlign: "center", fontSize: "12px", color: labelColor }}>—</div>
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#00f2ff" }}>{filters.ageMax}</span>
          </div>

          <div style={{ marginBottom: "8px" }}>
            <label style={{ fontSize: "12px", color: labelColor, display: "block", marginBottom: "4px" }}>
              Minimum yaş: {filters.ageMin}
            </label>
            <input
              type="range" min={18} max={filters.ageMax - 1} value={filters.ageMin}
              disabled={!isPremium}
              onChange={(e) => setFilters(prev => ({ ...prev, ageMin: parseInt(e.target.value) }))}
              style={{ width: "100%", accentColor: "#00f2ff", opacity: isPremium ? 1 : 0.4 }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: labelColor, display: "block", marginBottom: "4px" }}>
              Maksimum yaş: {filters.ageMax}
            </label>
            <input
              type="range" min={filters.ageMin + 1} max={100} value={filters.ageMax}
              disabled={!isPremium}
              onChange={(e) => setFilters(prev => ({ ...prev, ageMax: parseInt(e.target.value) }))}
              style={{ width: "100%", accentColor: "#00f2ff", opacity: isPremium ? 1 : 0.4 }}
            />
          </div>
        </div>

        {/* Gender */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: titleColor }}>Cinsiyet</span>
            <FilterLock locked={!isPremium} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {[
              { value: "all", label: "Tümü", emoji: "👥" },
              { value: "male", label: "Erkek", emoji: "👨" },
              { value: "female", label: "Kadın", emoji: "👩" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  if (!isPremium && option.value !== "all") {
                    alert("Bu özellik Premium üyelere özeldir.");
                    return;
                  }
                  setFilters(prev => ({ ...prev, gender: option.value }));
                }}
                style={{
                  padding: "12px 8px", borderRadius: "12px", textAlign: "center",
                  cursor: "pointer", border: "none",
                  background: filters.gender === option.value
                    ? "linear-gradient(135deg, rgba(0,242,255,0.2), rgba(255,20,147,0.2))"
                    : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"),
                  outline: filters.gender === option.value
                    ? "1px solid rgba(0,242,255,0.4)"
                    : (isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.1)"),
                  opacity: !isPremium && option.value !== "all" ? 0.5 : 1,
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: "20px", marginBottom: "4px" }}>{option.emoji}</div>
                <div style={{
                  fontSize: "12px", fontWeight: 600,
                  color: filters.gender === option.value ? "#00f2ff" : labelColor,
                }}>
                  {option.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Interests */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: titleColor }}>İlgi Alanları</span>
            <FilterLock locked={!isPremium} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {INTERESTS.map((interest) => {
              const isSelected = filters.interests.includes(interest);
              return (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "6px 12px", borderRadius: "20px",
                    fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(0,242,255,0.2), rgba(255,20,147,0.2))"
                      : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"),
                    border: isSelected
                      ? "1px solid rgba(0,242,255,0.4)"
                      : (isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.1)"),
                    color: isSelected ? "#00f2ff" : labelColor,
                    opacity: !isPremium ? 0.6 : 1,
                    transition: "all 0.2s",
                  }}
                >
                  {isSelected && <span>✓</span>}
                  {interest}
                </button>
              );
            })}
          </div>
        </div>

        {/* Country */}
        <div style={{ ...cardStyle, marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: titleColor }}>Konum</span>
            <FilterLock locked={!isPremium} />
          </div>
          <select
            value={filters.country}
            disabled={!isPremium}
            onChange={(e) => setFilters(prev => ({ ...prev, country: e.target.value }))}
            style={{
              width: "100%",
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
              color: isDark ? "#f0f4ff" : "#1a1a2e",
              border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.12)",
              borderRadius: "12px",
              padding: "10px 12px", fontSize: "14px", opacity: isPremium ? 1 : 0.4,
            }}
          >
            <option value="" style={{ background: isDark ? "#0a0b0f" : "#ffffff" }}>Tüm ülkeler</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c} style={{ background: isDark ? "#0a0b0f" : "#ffffff" }}>{c}</option>
            ))}
          </select>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          style={{
            width: "100%", padding: "16px", borderRadius: "14px", border: "none",
            cursor: "pointer", fontSize: "16px", fontWeight: 700,
            background: isPremium
              ? "linear-gradient(135deg, #00f2ff, #ff1493)"
              : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"),
            color: isPremium ? "#0a0b0f" : labelColor,
            boxShadow: isPremium ? "0 4px 20px rgba(0,242,255,0.3)" : "none",
            transition: "all 0.2s",
          }}
        >
          {isPremium ? "Filtreleri Kaydet" : "Premium'a Yükselt"}
        </button>
        <button
          onClick={() => setFilters({ ageMin: 18, ageMax: 50, gender: "all", interests: [], country: "" })}
          style={{
            display: "block", margin: "12px auto 0", background: "none", border: "none",
            color: labelColor, fontSize: "13px", cursor: "pointer",
          }}
        >
          Filtreleri Sıfırla
        </button>
      </div>
    </div>
  );
}
