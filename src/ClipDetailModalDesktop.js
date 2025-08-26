// src/ClipDetailModalDesktop.js
// Masaüstü Clip modalı — pırıl pırıl, sade, video odaklı

import { useEffect, useRef } from "react";
import "./ClipDetailModalDesktop.css";

export default function ClipDetailModalDesktop({ clip, onClose }) {
  const videoRef = useRef(null);

  const src =
    clip?.mediaUrl || clip?.videoUrl || clip?.url || clip?.sourceUrl || "";

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    // Autoplay politikaları için güvenli başlatma
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.playsInline = true;
    const start = async () => {
      try {
        await v.play();
      } catch (_) {
        // otomatik oynatma engellenirse sorun değil, kullanıcı etkileşimiyle başlar
      }
    };
    start();
  }, []);

  return (
    <div className="clipdesk__panel" role="dialog" aria-modal="true">
      <button className="clipdesk__close" onClick={onClose} aria-label="Kapat">
        ✕
      </button>
      <div className="clipdesk__content">
        <div className="clipdesk__videoWrap">
          {src ? (
            <video
              ref={videoRef}
              src={src}
              controls
              playsInline
              muted
              className="clipdesk__video"
            />
          ) : (
            <div className="clipdesk__empty">Video bulunamadı</div>
          )}
        </div>
        {clip?.caption ? (
          <div className="clipdesk__meta">
            <div className="clipdesk__caption">{clip.caption}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
