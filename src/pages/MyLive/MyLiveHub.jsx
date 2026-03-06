// FILE: src/pages/MyLive/MyLiveHub.jsx
// Manus önizlemesiyle birebir aynı tasarım - inline style versiyonu
import React, { useState, useEffect } from "react";
import "../../styles/myLive.css";

const INTERESTS = [
  "Müzik", "Spor", "Teknoloji", "Sanat", "Oyun", "Film",
  "Seyahat", "Yemek", "Moda", "Fotoğraf",
];

const CYAN = "#00c8e0";
const MAGENTA = "#d946a8";
const GOLD = "#c9a227";
const GREEN = "#22c97a";

function RadioIcon({ size = 22, color = "#0a0b0f" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill={color} />
    </svg>
  );
}

export default function MyLiveHub({ user, onStart, onFilters, onThemeChange }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("myLiveTheme");
    return saved !== null ? saved === "dark" : true;
  });
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [activeStreams, setActiveStreams] = useState(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    localStorage.setItem("myLiveTheme", isDark ? "dark" : "light");
    onThemeChange?.(isDark);
  }, [isDark]);

  useEffect(() => {
    const base = Math.floor(Math.random() * 80) + 40;
    setActiveStreams(base);
    const interval = setInterval(() => {
      setActiveStreams(prev => Math.max(10, prev + Math.floor(Math.random() * 5) - 2));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const toggleInterest = (interest) => {
    setSelectedInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const handleStart = () => {
    setIsStarting(true);
    setTimeout(() => { setIsStarting(false); onStart?.(); }, 300);
  };

  const bg = isDark ? "#0a0b0f" : "#f0f4ff";
  const textPrimary = isDark ? "#f0f4ff" : "#1a1a2e";
  const textSecondary = isDark ? "rgba(176,184,212,0.8)" : "rgba(60,80,120,0.75)";
  const glassBg = isDark ? "rgba(18,20,30,0.7)" : "rgba(255,255,255,0.85)";
  const glassBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
  const cardBg = isDark ? "rgba(18,20,30,0.7)" : "rgba(255,255,255,0.9)";
  const cardBorder = isDark ? "rgba(0,200,224,0.08)" : "rgba(0,160,200,0.15)";

  const displayName = user?.displayName?.split(" ")[0] || user?.name?.split(" ")[0] || null;

  return (
    <div style={{
      minHeight: "100dvh",
      background: bg,
      color: textPrimary,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflowY: "auto",
      paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
      position: "relative",
      transition: "background 0.3s, color 0.3s",
    }}>
      {/* Background gradient */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: isDark
          ? "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(0,200,224,0.10) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(217,70,168,0.07) 0%, transparent 60%)"
          : "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(0,180,210,0.08) 0%, transparent 70%)",
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ===== HERO SECTION ===== */}
        <div style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ padding: "40px 16px 24px" }}>

            {/* Brand + Controls */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
              {/* Logo */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "42px", height: "42px", borderRadius: "14px",
                  background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 20px rgba(0,200,224,0.35), 0 0 60px rgba(0,200,224,0.15)`,
                  flexShrink: 0,
                }}>
                  <RadioIcon size={22} color="#ffffff" />
                </div>
                <div>
                  <div style={{
                    fontSize: "20px", fontWeight: 800, lineHeight: 1,
                    background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  }}>MyLive</div>
                  <div style={{ fontSize: "10px", color: textSecondary, marginTop: "2px", lineHeight: 1 }}>
                    Canlı Video Sohbet
                  </div>
                </div>
              </div>

              {/* Right controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {/* Theme Toggle */}
                <button
                  onClick={() => setIsDark(d => !d)}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "6px 12px", borderRadius: "20px", border: "none", cursor: "pointer",
                    background: isDark ? "rgba(18,20,30,0.8)" : "rgba(240,244,255,0.9)",
                    outline: isDark ? "1px solid rgba(0,200,224,0.2)" : "1px solid rgba(0,160,200,0.2)",
                    backdropFilter: "blur(12px)",
                    fontSize: "12px", fontWeight: 600,
                    color: isDark ? "rgba(176,184,212,0.9)" : "rgba(60,80,120,0.85)",
                  }}
                >
                  <span style={{
                    width: "20px", height: "20px", borderRadius: "50%",
                    background: isDark ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : `linear-gradient(135deg, ${GOLD}, #f59e0b)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "11px",
                  }}>
                    {isDark ? "🌙" : "☀️"}
                  </span>
                  {isDark ? "Karanlık" : "Aydınlık"}
                </button>

                {/* Live badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "20px",
                  background: glassBg, outline: `1px solid rgba(0,200,224,0.2)`,
                  backdropFilter: "blur(12px)",
                }}>
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%", background: MAGENTA,
                    animation: "mylive-pulse 2s ease-in-out infinite",
                    display: "block",
                  }} />
                  <span style={{ fontSize: "12px", fontWeight: 700, color: CYAN }}>
                    {activeStreams ?? "—"} Canlı
                  </span>
                </div>
              </div>
            </div>

            {/* Merhaba */}
            {displayName && (
              <p style={{ fontSize: "14px", color: textSecondary, marginBottom: "16px", marginTop: "-16px" }}>
                Merhaba, {displayName} 👋
              </p>
            )}

            {/* Hero Text */}
            <div style={{ marginBottom: "32px" }}>
              <h2 style={{ fontSize: "32px", fontWeight: 800, lineHeight: 1.2, marginBottom: "8px", color: textPrimary, margin: "0 0 8px 0" }}>
                Dünyayla<br />
                <span style={{
                  background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>Bağlan.</span>
              </h2>
              <p style={{ fontSize: "14px", color: textSecondary, lineHeight: 1.6, maxWidth: "300px", margin: 0 }}>
                Rastgele insanlarla gerçek zamanlı video sohbet yap. Yeni arkadaşlar edin, farklı kültürler keşfet.
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
              <button
                onClick={handleStart}
                disabled={isStarting}
                style={{
                  width: "100%", padding: "16px", borderRadius: "16px", border: "none",
                  background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
                  color: "#0a0b0f", fontSize: "16px", fontWeight: 700, cursor: "pointer",
                  boxShadow: `0 8px 32px rgba(0,200,224,0.3)`,
                  transition: "all 0.3s", opacity: isStarting ? 0.7 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                }}
              >
                {isStarting ? (
                  <>
                    <div style={{
                      width: "16px", height: "16px", borderRadius: "50%",
                      border: "2px solid #0a0b0f", borderTopColor: "transparent",
                      animation: "spin 0.8s linear infinite",
                    }} />
                    Başlatılıyor...
                  </>
                ) : (
                  <>⚡ Canlı Yayın Başlat</>
                )}
              </button>

              <button
                onClick={() => onStart?.()}
                style={{
                  width: "100%", padding: "16px", borderRadius: "16px",
                  background: glassBg, outline: `1px solid rgba(0,200,224,0.3)`,
                  border: "none",
                  color: CYAN, fontSize: "16px", fontWeight: 600, cursor: "pointer",
                  backdropFilter: "blur(12px)", transition: "all 0.3s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                }}
              >
                🎲 Rastgele Bağlan
              </button>
            </div>

            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "8px" }}>
              {[
                { value: activeStreams ?? "—", label: "Aktif Yayın", color: CYAN },
                { value: "P2P", label: "Şifreli Bağlantı", color: MAGENTA },
                { value: "100%", label: "Güvenli", color: GREEN },
              ].map((stat, i) => (
                <div key={i} style={{
                  background: glassBg, outline: `1px solid ${glassBorder}`,
                  borderRadius: "14px", padding: "12px 8px", textAlign: "center",
                  backdropFilter: "blur(12px)",
                }}>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: "10px", color: textSecondary, marginTop: "2px" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== İLGİ ALANLARI ===== */}
        <div style={{ padding: "8px 16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "11px", fontWeight: 700, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>
              İlgi Alanları
            </h3>
            <button
              onClick={() => onFilters?.()}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: CYAN, fontSize: "12px", fontWeight: 600,
                display: "flex", alignItems: "center", gap: "4px",
              }}
            >
              🔧 Filtrele
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {INTERESTS.map((interest) => {
              const isSelected = selectedInterests.includes(interest);
              return (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  style={{
                    padding: "7px 14px", borderRadius: "20px", border: "none", cursor: "pointer",
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(0,200,224,0.2), rgba(217,70,168,0.2))"
                      : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"),
                    outline: isSelected ? `1px solid rgba(0,200,224,0.5)` : `1px solid ${glassBorder}`,
                    color: isSelected ? CYAN : textSecondary,
                    fontSize: "13px", fontWeight: 600,
                    transition: "all 0.2s",
                  }}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== MYLİVE ÖZELLİKLERİ ===== */}
        <div style={{ padding: "0 16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "11px", fontWeight: 700, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>
              MyLive Özellikleri
            </h3>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: CYAN, fontSize: "12px", fontWeight: 600 }}>
              Hepsini gör ›
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { emoji: "⚡", title: "Anında Bağlan", desc: "Rastgele biri ile 2-5 saniyede video sohbet başlat", color: GOLD, bg: "rgba(201,162,39,0.12)", border: "rgba(201,162,39,0.2)" },
              { emoji: "👥", title: "Rastgele Eşleştirme", desc: "İlgi alanlarına göre akıllı eşleştirme algoritması", color: MAGENTA, bg: "rgba(217,70,168,0.12)", border: "rgba(217,70,168,0.2)" },
              { emoji: "🔒", title: "Güvenli & Şifreli", desc: "WebRTC ile uçtan uca şifreli P2P bağlantı", color: GREEN, bg: "rgba(34,201,122,0.12)", border: "rgba(34,201,122,0.2)" },
              { emoji: "⭐", title: "Değerlendirme Sistemi", desc: "Her bağlantıdan sonra 5 yıldızlı puanlama", color: CYAN, bg: "rgba(0,200,224,0.12)", border: "rgba(0,200,224,0.2)" },
            ].map((feature) => (
              <div key={feature.title} style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "14px 16px", borderRadius: "16px",
                background: cardBg, outline: `1px solid ${cardBorder}`,
                backdropFilter: "blur(12px)",
                boxShadow: isDark ? "none" : "0 2px 8px rgba(0,0,0,0.06)",
                cursor: "pointer",
              }}>
                <div style={{
                  width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                  background: feature.bg, outline: `1px solid ${feature.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "20px",
                }}>
                  {feature.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: textPrimary, marginBottom: "2px" }}>
                    {feature.title}
                  </div>
                  <div style={{ fontSize: "12px", color: textSecondary, lineHeight: 1.4 }}>
                    {feature.desc}
                  </div>
                </div>
                <span style={{ color: textSecondary, fontSize: "16px" }}>›</span>
              </div>
            ))}
          </div>
        </div>

        {/* ===== PREMIUM CTA ===== */}
        <div style={{ padding: "0 16px 32px" }}>
          <div style={{
            borderRadius: "16px", padding: "16px",
            background: isDark
              ? "linear-gradient(135deg, rgba(217,70,168,0.12), rgba(99,102,241,0.12))"
              : "linear-gradient(135deg, rgba(217,70,168,0.08), rgba(99,102,241,0.08))",
            outline: "1px solid rgba(217,70,168,0.25)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "18px" }}>👑</span>
                  <span style={{
                    fontSize: "14px", fontWeight: 700,
                    background: `linear-gradient(135deg, ${GOLD}, ${CYAN})`,
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  }}>Premium</span>
                </div>
                <p style={{ fontSize: "12px", color: textSecondary, margin: 0 }}>
                  Gelişmiş filtreler ve öncelikli eşleştirme
                </p>
              </div>
              <button
                onClick={() => onFilters?.()}
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "8px 16px", borderRadius: "12px", border: "none", cursor: "pointer",
                  background: `linear-gradient(135deg, ${MAGENTA}, #6366f1)`,
                  color: "#fff", fontSize: "13px", fontWeight: 700, flexShrink: 0,
                }}
              >
                Keşfet ›
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes mylive-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } }
      `}</style>
    </div>
  );
}
