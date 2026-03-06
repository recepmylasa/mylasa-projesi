import React, { useState, useEffect } from "react";
import "../../styles/myLive.css";

const MESSAGES = [
  "Aktif kullanıcılar taranıyor...",
  "Uyumlu biri aranıyor...",
  "Bağlantı kuruluyor...",
  "Neredeyse hazır...",
];

export default function LoadingScreen({ onCancel, user, filters }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const m = setInterval(() => setMsgIdx((p) => (p + 1) % MESSAGES.length), 2500);
    const e = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => { clearInterval(m); clearInterval(e); };
  }, []);

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0a0b0f",
        color: "#f0f4ff",
        fontFamily: "Inter, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(0,242,255,0.06) 0%, transparent 60%)",
        }}
      />

      {/* Radar */}
      <div
        style={{ position: "relative", width: "200px", height: "200px", marginBottom: "40px" }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid rgba(0,242,255,0.4)",
              animation: `ml-radar-ring 2s ease-out ${i * 0.65}s infinite`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #00f2ff, #ff1493)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              boxShadow: "0 0 40px rgba(0,242,255,0.5), 0 0 80px rgba(0,242,255,0.2)",
              animation: "ml-float 4s ease-in-out infinite",
              overflow: "hidden",
            }}
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "📡"
            )}
          </div>
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: i === 0 ? "#00f2ff" : i === 1 ? "#ff1493" : "#ffd740",
              boxShadow: `0 0 8px ${i === 0 ? "#00f2ff" : i === 1 ? "#ff1493" : "#ffd740"}`,
              animation: `ml-orbit-${i} 3s linear infinite`,
            }}
          />
        ))}
      </div>

      <h2
        style={{ fontSize: "22px", fontWeight: 800, color: "#f0f4ff", margin: "0 0 8px" }}
      >
        Eşleşme Aranıyor
      </h2>
      <p style={{ fontSize: "14px", color: "rgba(180,190,220,0.6)", margin: "0 0 24px" }}>
        {MESSAGES[msgIdx]}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 20px",
          borderRadius: "20px",
          background: "rgba(18,20,30,0.8)",
          border: "1px solid rgba(0,242,255,0.15)",
          marginBottom: "32px",
          fontSize: "14px",
          fontWeight: 700,
          color: "#00f2ff",
        }}
      >
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#00f2ff",
            animation: "ml-live-pulse 1.5s ease-in-out infinite",
          }}
        />
        {fmt(elapsed)}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "40px" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#00f2ff",
              animation: `ml-dot-bounce 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      <button
        onClick={onCancel}
        style={{
          padding: "12px 40px",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "transparent",
          color: "rgba(180,190,220,0.6)",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        İptal Et
      </button>
    </div>
  );
}
