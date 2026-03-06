import React, { useState, useEffect } from "react";
import "../../styles/myLive.css";

const INTERESTS = [
  "Müzik", "Spor", "Teknoloji", "Sanat", "Oyun", "Film",
  "Seyahat", "Yemek", "Moda", "Fotoğraf",
];

const FEATURES = [
  {
    icon: "⚡",
    iconBg: "linear-gradient(135deg, rgba(0,242,255,0.2), rgba(0,242,255,0.05))",
    iconBorder: "rgba(0,242,255,0.2)",
    title: "Anında Bağlan",
    desc: "Rastgele biri ile 2-5 saniyede video sohbet başlat",
  },
  {
    icon: "🎯",
    iconBg: "linear-gradient(135deg, rgba(255,20,147,0.2), rgba(255,20,147,0.05))",
    iconBorder: "rgba(255,20,147,0.2)",
    title: "Akıllı Eşleştirme",
    desc: "İlgi alanlarına göre filtrelenmiş eşleştirme algoritması",
  },
  {
    icon: "🔒",
    iconBg: "linear-gradient(135deg, rgba(0,230,118,0.2), rgba(0,230,118,0.05))",
    iconBorder: "rgba(0,230,118,0.2)",
    title: "Güvenli & Şifreli",
    desc: "WebRTC ile uçtan uca şifreli P2P bağlantı",
  },
  {
    icon: "⭐",
    iconBg: "linear-gradient(135deg, rgba(255,215,64,0.2), rgba(255,215,64,0.05))",
    iconBorder: "rgba(255,215,64,0.2)",
    title: "Puanlama Sistemi",
    desc: "Her bağlantı sonrası 5 yıldızlı değerlendirme",
  },
];

export default function MyLiveHub({ onStart, onFilters, user }) {
  const [activeCount, setActiveCount] = useState(Math.floor(Math.random() * 80) + 20);
  const [avgRating] = useState((Math.random() * 1.5 + 3.5).toFixed(1));
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem("mylasa-theme") || "dark");

  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mylasa-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  const toggleInterest = (interest) => {
    setSelectedInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCount((prev) => Math.max(5, prev + Math.floor(Math.random() * 5) - 2));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const displayName = user?.displayName?.split(" ")[0] || user?.name || "Kullanıcı";

  const S = {
    page: {
      minHeight: "100dvh",
      background: isDark ? "#0a0b0f" : "#f0f4ff",
      color: isDark ? "#f0f4ff" : "#1a1a2e",
      transition: "background 0.3s, color 0.3s",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
      overflowY: "auto",
      position: "relative",
    },
    bgGlow: {
      position: "fixed",
      inset: 0,
      pointerEvents: "none",
      zIndex: 0,
      background:
        "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,242,255,0.07) 0%, transparent 60%), " +
        "radial-gradient(ellipse 60% 40% at 80% 80%, rgba(255,20,147,0.05) 0%, transparent 50%)",
    },
    inner: {
      position: "relative",
      zIndex: 1,
      maxWidth: "480px",
      margin: "0 auto",
      padding: "0 16px",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "20px 0 12px",
    },
    title: {
      fontSize: "26px",
      fontWeight: 800,
      background: "linear-gradient(135deg, #00f2ff, #ff1493)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      margin: 0,
      letterSpacing: "-0.5px",
    },
    subtitle: {
      fontSize: "13px",
      color: "rgba(180,190,220,0.6)",
      margin: "2px 0 0",
    },
    liveBadge: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 12px",
      borderRadius: "20px",
      background: "rgba(0,242,255,0.1)",
      border: "1px solid rgba(0,242,255,0.25)",
      fontSize: "12px",
      fontWeight: 600,
      color: "#00f2ff",
    },
    liveDot: {
      width: "7px",
      height: "7px",
      borderRadius: "50%",
      background: "#00f2ff",
      animation: "ml-live-pulse 1.5s ease-in-out infinite",
    },
    statsBanner: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-around",
      padding: "16px",
      borderRadius: "16px",
      background: "linear-gradient(135deg, rgba(0,242,255,0.08), rgba(255,20,147,0.08))",
      border: "1px solid rgba(0,242,255,0.15)",
      marginBottom: "16px",
    },
    statDivider: {
      width: "1px",
      height: "36px",
      background: "rgba(0,242,255,0.15)",
    },
    btnPrimary: {
      width: "100%",
      padding: "16px",
      borderRadius: "14px",
      border: "none",
      cursor: "pointer",
      fontSize: "16px",
      fontWeight: 700,
      color: "#0a0b0f",
      background: "linear-gradient(135deg, #00f2ff 0%, #ff1493 100%)",
      boxShadow: "0 4px 20px rgba(0,242,255,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "10px",
      transition: "transform 0.15s",
    },
    btnSecondary: {
      width: "100%",
      padding: "14px",
      borderRadius: "14px",
      border: "1px solid rgba(0,242,255,0.3)",
      cursor: "pointer",
      fontSize: "15px",
      fontWeight: 600,
      color: "#00f2ff",
      background: "rgba(0,242,255,0.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "10px",
      transition: "background 0.2s, transform 0.15s",
    },
    proBadge: {
      marginLeft: "auto",
      padding: "2px 8px",
      borderRadius: "10px",
      background: "linear-gradient(135deg, rgba(255,20,147,0.2), rgba(255,20,147,0.1))",
      border: "1px solid rgba(255,20,147,0.3)",
      fontSize: "10px",
      fontWeight: 700,
      color: "#ff1493",
    },
    sectionTitle: {
      fontSize: "12px",
      fontWeight: 700,
      color: "rgba(180,190,220,0.5)",
      textTransform: "uppercase",
      letterSpacing: "0.8px",
      marginBottom: "12px",
    },
    featureCard: {
      display: "flex",
      alignItems: "center",
      gap: "14px",
      padding: "14px",
      borderRadius: "14px",
      background: "rgba(18,20,30,0.7)",
      border: "1px solid rgba(0,242,255,0.08)",
      marginBottom: "10px",
      cursor: "pointer",
      transition: "background 0.2s, border-color 0.2s",
    },
    premiumBanner: {
      padding: "20px",
      borderRadius: "20px",
      background: "linear-gradient(135deg, rgba(255,20,147,0.1), rgba(0,242,255,0.1))",
      border: "1px solid rgba(255,20,147,0.2)",
      marginBottom: "24px",
      position: "relative",
      overflow: "hidden",
    },
  };

  return (
    <div style={S.page}>
      <div style={S.bgGlow} />
      <div style={S.inner}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <h1 style={S.title}>MyLive</h1>
            <p style={S.subtitle}>Merhaba, {displayName} 👋</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                borderRadius: "20px",
                border: isDark ? "1px solid rgba(0,242,255,0.3)" : "1px solid rgba(0,0,0,0.15)",
                background: isDark ? "rgba(0,242,255,0.08)" : "rgba(0,0,0,0.06)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                color: isDark ? "#00f2ff" : "#6b21a8",
              }}
            >
              {isDark ? "☀️ Aydınlık" : "🌙 Karanlık"}
            </button>
            <div style={S.liveBadge}>
              <div style={S.liveDot} />
              {activeCount} Canlı
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={S.statsBanner}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#00f2ff", lineHeight: 1 }}>
              {activeCount}
            </div>
            <div style={{ fontSize: "11px", color: "rgba(180,190,220,0.6)", marginTop: "4px" }}>
              Aktif Kullanıcı
            </div>
          </div>
          <div style={S.statDivider} />
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#ff1493", lineHeight: 1 }}>P2P</div>
            <div style={{ fontSize: "11px", color: "rgba(180,190,220,0.6)", marginTop: "4px" }}>
              Şifreli Bağlantı
            </div>
          </div>
          <div style={S.statDivider} />
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#ffd740", lineHeight: 1 }}>
              {avgRating}★
            </div>
            <div style={{ fontSize: "11px", color: "rgba(180,190,220,0.6)", marginTop: "4px" }}>
              Puanlama
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
          <button
            style={S.btnPrimary}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onClick={() => {
              if (!user) { alert("MyLive'ı kullanmak için giriş yapmalısınız."); return; }
              onStart?.("random");
            }}
          >
            <span style={{ fontSize: "20px" }}>📡</span>
            Rastgele Bağlan
          </button>

          <button
            style={S.btnSecondary}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onTouchStart={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onClick={() => {
              if (!user) { alert("MyLive'ı kullanmak için giriş yapmalısınız."); return; }
              onFilters?.();
            }}
          >
            <span style={{ fontSize: "18px" }}>⚙️</span>
            Premium Filtreler
            <span style={S.proBadge}>PRO</span>
          </button>
        </div>

        {/* Features */}
        <div style={{ marginBottom: "24px" }}>
          <p style={S.sectionTitle}>MYLİVE ÖZELLİKLERİ</p>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              style={S.featureCard}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0,242,255,0.06)";
                e.currentTarget.style.borderColor = "rgba(0,242,255,0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(18,20,30,0.7)";
                e.currentTarget.style.borderColor = "rgba(0,242,255,0.08)";
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: f.iconBg,
                  border: `1px solid ${f.iconBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  flexShrink: 0,
                }}
              >
                {f.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#f0f4ff", marginBottom: "3px" }}>
                  {f.title}
                </div>
                <div style={{ fontSize: "12px", color: "rgba(180,190,220,0.6)" }}>{f.desc}</div>
              </div>
              <span style={{ color: "rgba(180,190,220,0.4)", fontSize: "16px" }}>›</span>
            </div>
          ))}
        </div>

        {/* Interest Chips */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <p style={S.sectionTitle}>İLGİ ALANLARI</p>
            <button
              onClick={() => onFilters?.()}
              style={{ fontSize: "12px", color: "#00f2ff", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
            >
              ⚙️ Filtreler
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {INTERESTS.map(interest => {
              const sel = selectedInterests.includes(interest);
              return (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: sel ? "1px solid rgba(0,242,255,0.6)" : isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.12)",
                    background: sel ? "linear-gradient(135deg, rgba(0,242,255,0.2), rgba(255,20,147,0.2))" : isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                    color: sel ? "#00f2ff" : isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)",
                    transition: "all 0.2s",
                  }}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </div>

        {/* Premium Banner */}
        <div style={S.premiumBanner}>
          <div
            style={{
              position: "absolute",
              top: "-20px",
              right: "-20px",
              width: "100px",
              height: "100px",
              borderRadius: "50%",
              background: "rgba(255,20,147,0.08)",
              filter: "blur(20px)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ fontSize: "32px" }}>👑</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#f0f4ff", marginBottom: "4px" }}>
                Premium'a Yükselt
              </div>
              <div style={{ fontSize: "12px", color: "rgba(180,190,220,0.6)" }}>
                Gelişmiş filtreler, öncelikli eşleştirme ve daha fazlası
              </div>
            </div>
            <button
              style={{
                padding: "10px 16px",
                borderRadius: "12px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 700,
                background: "linear-gradient(135deg, #ff1493, #00f2ff)",
                color: "#0a0b0f",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              onClick={() => alert("Premium özelliği yakında!")}
            >
              Yükselt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
