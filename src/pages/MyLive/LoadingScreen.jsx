import React, { useState, useEffect, useRef } from "react";
import "../../styles/myLive.css";

const MESSAGES = [
  "Aktif kullanıcılar taranıyor...",
  "Uygun biri bulunuyor...",
  "Bağlantı kuruluyor...",
  "Neredeyse hazır...",
];

export default function LoadingScreen({ onCancel, user, filters }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setMsgIdx((p) => (p + 1) % MESSAGES.length), 2500);
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
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
      {/* Background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(0,242,255,0.06) 0%, transparent 70%)",
        }}
      />

      {/* Grid overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.03,
          backgroundImage:
            "linear-gradient(rgba(0,242,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,242,255,1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Cancel X button */}
      <button
        onClick={onCancel}
        style={{
          position: "absolute",
          top: "24px",
          right: "24px",
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: "18px",
          color: "rgba(180,190,220,0.6)",
        }}
      >
        ✕
      </button>

      {/* Radar */}
      <div
        style={{ position: "relative", width: "192px", height: "192px", marginBottom: "40px" }}
      >
        {/* Radar rings */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `1px solid rgba(0,242,255,${0.3 - i * 0.1})`,
              animation: `ml-radar-ring 2s ease-out ${i * 0.65}s infinite`,
            }}
          />
        ))}

        {/* Inner circle */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "128px",
            height: "128px",
            borderRadius: "50%",
            background: "rgba(0,242,255,0.05)",
            border: "1px solid rgba(0,242,255,0.2)",
          }}
        />

        {/* Center - user photo or icon */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
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
            "👥"
          )}
        </div>

        {/* Orbiting dots */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: i === 0 ? "#00f2ff" : i === 1 ? "#ff1493" : "#ffd740",
              boxShadow: `0 0 8px ${i === 0 ? "#00f2ff" : i === 1 ? "#ff1493" : "#ffd740"}`,
              animation: `ml-orbit-${i} 3s linear infinite`,
            }}
          />
        ))}
      </div>

      {/* Status text */}
      <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#f0f4ff", margin: "0 0 8px" }}>
        Eşleşme Aranıyor
      </h2>
      <p
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#00f2ff",
          margin: "0 0 24px",
          transition: "all 0.5s",
        }}
      >
        {MESSAGES[msgIdx]}
      </p>

      {/* Timer */}
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
            background: "#ff1493",
            animation: "ml-live-pulse 1.5s ease-in-out infinite",
          }}
        />
        {fmt(elapsed)}
      </div>

      {/* Info cards */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "40px" }}>
        {[
          { icon: "📶", label: "P2P Şifreli", color: "rgba(0,230,118,1)" },
          { icon: "⚡", label: "Düşük Gecikme", color: "rgba(255,215,64,1)" },
          { icon: "👥", label: "Rastgele", color: "rgba(0,242,255,1)" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              padding: "8px 12px",
              borderRadius: "12px",
              background: "rgba(18,20,30,0.7)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span style={{ fontSize: "16px" }}>{item.icon}</span>
            <span style={{ fontSize: "10px", color: "rgba(180,190,220,0.6)" }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Cancel button */}
      <button
        onClick={onCancel}
        style={{
          padding: "12px 40px",
          borderRadius: "14px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(18,20,30,0.7)",
          color: "rgba(180,190,220,0.6)",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Aramayı İptal Et
      </button>
    </div>
  );
}
