// FILE: src/pages/MyLive/LoadingScreen.jsx
import React, { useEffect, useState } from "react";
import "../../styles/myLive.css";

const MESSAGES = [
  "Kullanıcılar aranıyor...",
  "Eşleşme bulunuyor...",
  "Bağlantı hazırlanıyor...",
  "Neredeyse hazır...",
];

export default function LoadingScreen({ onCancel, user }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2500);
    const elapsedTimer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { clearInterval(msgTimer); clearInterval(elapsedTimer); };
  }, []);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="mylive-loading">
      {/* Radar */}
      <div className="mylive-radar-container">
        <div className="mylive-radar-ring" />
        <div className="mylive-radar-ring" />
        <div className="mylive-radar-ring" />
        <div className="mylive-radar-center">
          <div className="mylive-radar-avatar">
            {user?.photoURL
              ? <img src={user.photoURL} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
              : "📡"}
          </div>
        </div>
      </div>

      <div className="mylive-loading-title">Eşleşme Aranıyor</div>
      <div className="mylive-loading-subtitle">{MESSAGES[msgIndex]}</div>

      <div className="mylive-loading-dots">
        <div className="mylive-loading-dot" />
        <div className="mylive-loading-dot" />
        <div className="mylive-loading-dot" />
      </div>

      <div style={{ marginBottom: 24, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
        {formatTime(elapsed)} bekleniyor
      </div>

      <button className="mylive-cancel-btn" onClick={onCancel}>
        İptal Et
      </button>
    </div>
  );
}
