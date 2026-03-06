// FILE: src/pages/MyLive/PremiumFilters.jsx
// Manus önizlemesiyle birebir aynı tasarım - inline style versiyonu
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

const CYAN = "#00c8e0";
const MAGENTA = "#d946a8";

export default function PremiumFilters({ onBack, onSave, isDark = true, isPremium = false }) {
  const [filters, setFilters] = useState({
    ageMin: 18,
    ageMax: 50,
    gender: "all",
    interests: [],
    country: "",
  });

  const bg = isDark ? "#0a0b0f" : "#f0f4ff";
  const textPrimary = isDark ? "#f0f4ff" : "#1a1a2e";
  const textSecondary = isDark ? "rgba(176,184,212,0.8)" : "rgba(60,80,120,0.75)";
  const cardBg = isDark ? "rgba(18,20,30,0.7)" : "rgba(255,255,255,0.9)";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
  const inputBg = isDark ? "rgba(18,20,30,0.8)" : "rgba(255,255,255,0.9)";
  const inputBorder = isDark ? "rgba(0,200,224,0.2)" : "rgba(0,160,200,0.25)";

  const toggleInterest = (interest) => {
    if (!isPremium) { alert("Bu özellik Premium üyelere özeldir."); return; }
    setFilters(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleSave = () => {
    if (!isPremium) { alert("Filtreleri kaydetmek için Premium üye olun."); return; }
    localStorage.setItem("myLiveFilters", JSON.stringify(filters));
    onSave?.(filters);
    onBack?.();
  };

  const PremiumBadge = () => (
    <span style={{
      padding: "2px 8px", borderRadius: "10px", fontSize: "10px", fontWeight: 700,
      background: "rgba(217,70,168,0.15)", border: "1px solid rgba(217,70,168,0.3)",
      color: MAGENTA,
    }}>🔒 Premium</span>
  );

  return (
    <div style={{
      minHeight: "100dvh", background: bg, color: textPrimary,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflowY: "auto", paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
      position: "relative", transition: "background 0.3s, color 0.3s",
    }}>
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: isDark
          ? "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(217,70,168,0.06) 0%, transparent 60%)"
          : "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(217,70,168,0.04) 0%, transparent 60%)",
      }} />

      <div style={{ position: "relative", maxWidth: "480px", margin: "0 auto", padding: "0 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "24px 0 20px" }}>
          <button onClick={onBack} style={{
            width: "36px", height: "36px", borderRadius: "12px",
            background: cardBg, border: `1px solid ${cardBorder}`,
            color: textPrimary, fontSize: "18px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(12px)",
          }}>←</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: textPrimary, margin: 0 }}>Filtreler</h1>
            <p style={{ fontSize: "12px", color: textSecondary, margin: 0 }}>Eşleşme tercihlerini ayarla</p>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "6px 12px", borderRadius: "20px",
            background: "linear-gradient(135deg, rgba(217,70,168,0.2), rgba(99,102,241,0.2))",
            border: "1px solid rgba(217,70,168,0.3)",
          }}>
            <span style={{ fontSize: "12px" }}>👑</span>
            <span style={{ fontSize: "12px", fontWeight: 700, color: MAGENTA }}>Premium</span>
          </div>
        </div>

        {/* Premium Banner */}
        {!isPremium && (
          <div style={{
            borderRadius: "16px", padding: "16px", marginBottom: "20px",
            background: "linear-gradient(135deg, rgba(217,70,168,0.12), rgba(99,102,241,0.12))",
            border: "1px solid rgba(217,70,168,0.25)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "28px" }}>👑</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: textPrimary, margin: "0 0 2px 0" }}>
                  Premium'a Yükselt
                </h3>
                <p style={{ fontSize: "12px", color: textSecondary, margin: 0 }}>
                  Gelişmiş filtreler ile ideal eşleşmeleri bul
                </p>
              </div>
              <button style={{
                padding: "8px 14px", borderRadius: "12px", border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${MAGENTA}, #6366f1)`,
                color: "#fff", fontSize: "12px", fontWeight: 700, flexShrink: 0,
              }}>Yükselt</button>
            </div>
          </div>
        )}

        {/* Age Range */}
        <div style={{ borderRadius: "16px", padding: "16px", marginBottom: "12px", background: cardBg, border: `1px solid ${cardBorder}`, backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: textPrimary }}>Yaş Aralığı</span>
              {!isPremium && <PremiumBadge />}
            </div>
            <span style={{ fontSize: "13px", fontWeight: 600, color: CYAN }}>{filters.ageMin} - {filters.ageMax}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {["ageMin", "ageMax"].map((key, i) => (
              <React.Fragment key={key}>
                {i === 1 && <span style={{ color: textSecondary }}>—</span>}
                <input type="number" min="18" max="99" value={filters[key]}
                  disabled={!isPremium}
                  onChange={e => setFilters(p => ({ ...p, [key]: parseInt(e.target.value) || (key === "ageMin" ? 18 : 50) }))}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: "10px",
                    border: `1px solid ${inputBorder}`, background: inputBg,
                    color: textPrimary, fontSize: "14px", textAlign: "center",
                    outline: "none", opacity: isPremium ? 1 : 0.5,
                  }}
                />
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Gender */}
        <div style={{ borderRadius: "16px", padding: "16px", marginBottom: "12px", background: cardBg, border: `1px solid ${cardBorder}`, backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: textPrimary }}>Cinsiyet</span>
            {!isPremium && <PremiumBadge />}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            {[
              { value: "all", label: "Hepsi", emoji: "👥" },
              { value: "male", label: "Erkek", emoji: "👨" },
              { value: "female", label: "Kadın", emoji: "👩" },
            ].map(opt => {
              const isSelected = filters.gender === opt.value;
              return (
                <button key={opt.value} disabled={!isPremium}
                  onClick={() => setFilters(p => ({ ...p, gender: opt.value }))}
                  style={{
                    flex: 1, padding: "10px 8px", borderRadius: "12px", border: "none",
                    cursor: isPremium ? "pointer" : "not-allowed",
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(0,200,224,0.2), rgba(217,70,168,0.2))"
                      : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"),
                    outline: isSelected ? `1px solid rgba(0,200,224,0.5)` : `1px solid ${cardBorder}`,
                    color: isSelected ? CYAN : textSecondary,
                    fontSize: "13px", fontWeight: 600,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                    opacity: isPremium ? 1 : 0.5,
                  }}
                >
                  <span style={{ fontSize: "20px" }}>{opt.emoji}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interests */}
        <div style={{ borderRadius: "16px", padding: "16px", marginBottom: "12px", background: cardBg, border: `1px solid ${cardBorder}`, backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: textPrimary }}>İlgi Alanları</span>
            {!isPremium && <PremiumBadge />}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {INTERESTS.map(interest => {
              const isSelected = filters.interests.includes(interest);
              return (
                <button key={interest} onClick={() => toggleInterest(interest)}
                  style={{
                    padding: "7px 12px", borderRadius: "20px", border: "none",
                    cursor: isPremium ? "pointer" : "not-allowed",
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(0,200,224,0.2), rgba(217,70,168,0.2))"
                      : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"),
                    outline: isSelected ? `1px solid rgba(0,200,224,0.5)` : `1px solid ${cardBorder}`,
                    color: isSelected ? CYAN : textSecondary,
                    fontSize: "13px", fontWeight: 600, opacity: isPremium ? 1 : 0.6,
                  }}
                >{interest}</button>
              );
            })}
          </div>
        </div>

        {/* Country */}
        <div style={{ borderRadius: "16px", padding: "16px", marginBottom: "24px", background: cardBg, border: `1px solid ${cardBorder}`, backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: textPrimary }}>Ülke</span>
            {!isPremium && <PremiumBadge />}
          </div>
          <select disabled={!isPremium} value={filters.country}
            onChange={e => setFilters(p => ({ ...p, country: e.target.value }))}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: "10px",
              border: `1px solid ${inputBorder}`, background: inputBg,
              color: filters.country ? textPrimary : textSecondary,
              fontSize: "14px", outline: "none",
              opacity: isPremium ? 1 : 0.5, cursor: isPremium ? "pointer" : "not-allowed",
            }}
          >
            <option value="">Tüm ülkeler</option>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "12px", paddingBottom: "32px" }}>
          <button
            onClick={() => setFilters({ ageMin: 18, ageMax: 50, gender: "all", interests: [], country: "" })}
            style={{
              flex: 1, padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer",
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
              outline: `1px solid ${cardBorder}`,
              color: textSecondary, fontSize: "14px", fontWeight: 600,
            }}
          >Sıfırla</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer",
            background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
            color: "#0a0b0f", fontSize: "14px", fontWeight: 700,
            boxShadow: `0 4px 20px rgba(0,200,224,0.25)`,
          }}>Kaydet</button>
        </div>
      </div>
    </div>
  );
}
