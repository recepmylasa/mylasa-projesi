// FILE: src/pages/MyLive/MyLiveBottomNav.jsx
// Manus önizlemesiyle birebir aynı MyLive bottom navigation bar - inline style versiyonu
import React from "react";

const CYAN = "#00c8e0";
const MAGENTA = "#d946a8";

// SVG ikon bileşenleri
const HomeIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={active ? CYAN : "rgba(140,150,180,0.7)"} strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ExploreIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={active ? CYAN : "rgba(140,150,180,0.7)"} strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const LiveIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={active ? "#0a0b0f" : CYAN} strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0z" />
    <circle cx="12" cy="12" r="3" fill={active ? "#0a0b0f" : CYAN} />
    <path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" />
  </svg>
);

const BellIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={active ? CYAN : "rgba(140,150,180,0.7)"} strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const UserIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke={active ? CYAN : "rgba(140,150,180,0.7)"} strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const NAV_ITEMS = [
  { key: "home", label: "Ana Sayfa", Icon: HomeIcon },
  { key: "explore", label: "Keşfet", Icon: ExploreIcon },
  { key: "mylive", label: "Canlı", Icon: LiveIcon, isLive: true },
  { key: "notifications", label: "Bildirim", Icon: BellIcon },
  { key: "profile", label: "Profil", Icon: UserIcon },
];

export default function MyLiveBottomNav({ activeTab = "mylive", onTabChange }) {
  return (
    <nav style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {/* Blur backdrop */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(10,11,15,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }} />

      {/* Top border glow */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "1px",
        background: `linear-gradient(90deg, transparent, rgba(0,200,224,0.4), rgba(217,70,168,0.4), transparent)`,
      }} />

      <div style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        padding: "0 8px",
        height: "68px",
      }}>
        {NAV_ITEMS.map(({ key, label, Icon, isLive }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => onTabChange?.(key)}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "3px",
                padding: "8px 12px",
                borderRadius: "12px",
                border: "none",
                cursor: "pointer",
                background: isActive && !isLive
                  ? "rgba(0,200,224,0.1)"
                  : "transparent",
                transform: isActive ? "scale(1.05)" : "scale(1)",
                transition: "all 0.25s ease",
                minWidth: "52px",
              }}
            >
              {isLive ? (
                /* MyLive özel yuvarlak buton */
                <div style={{ position: "relative" }}>
                  <div style={{
                    width: "40px", height: "40px",
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isActive
                      ? `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`
                      : `linear-gradient(135deg, rgba(0,200,224,0.2), rgba(217,70,168,0.2))`,
                    border: isActive ? "none" : `1px solid rgba(0,200,224,0.3)`,
                    boxShadow: isActive ? `0 0 20px rgba(0,200,224,0.4)` : "none",
                    transition: "all 0.25s ease",
                  }}>
                    <Icon active={isActive} />
                  </div>
                  {/* Canlı dot */}
                  {isActive && (
                    <span style={{
                      position: "absolute", top: "-2px", right: "-2px",
                      width: "10px", height: "10px",
                      borderRadius: "50%",
                      background: MAGENTA,
                      border: "2px solid #0a0b0f",
                      animation: "ml-live-pulse 1.5s ease-in-out infinite",
                    }} />
                  )}
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <Icon active={isActive} />
                  {isActive && (
                    <span style={{
                      position: "absolute", bottom: "-5px",
                      left: "50%", transform: "translateX(-50%)",
                      width: "4px", height: "4px",
                      borderRadius: "50%",
                      background: CYAN,
                    }} />
                  )}
                </div>
              )}
              <span style={{
                fontSize: "10px",
                fontWeight: 500,
                lineHeight: 1,
                color: isLive
                  ? (isActive ? CYAN : "rgba(140,150,180,0.7)")
                  : (isActive ? CYAN : "rgba(140,150,180,0.7)"),
                transition: "color 0.25s ease",
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes ml-live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </nav>
  );
}
