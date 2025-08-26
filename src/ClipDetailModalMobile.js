// src/ClipDetailModalMobile.js
// Mobil Clip modalı — tam ekran hissi, sade kontrol

import { useEffect, useRef } from "react";
import "./ClipDetailModalMobile.css";

export default function ClipDetailModalMobile({ clip, onClose }) {
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
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.playsInline = true;
    const start = async () => {
      try {
        await v.play();
      } catch (_) {}
    };
    start();
  }, []);

  return (
    <div className="clipmob__panel" role="dialog" aria-modal="true">
      <div className="clipmob__topbar">
        <button className="clipmob__close" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div className="clipmob__videoWrap">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            muted
            className="clipmob__video"
          />
        ) : (
          <div className="clipmob__empty">Video bulunamadı</div>
        )}
      </div>
      {clip?.caption ? (
        <div className="clipmob__caption">{clip.caption}</div>
      ) : null}
    </div>
  );
}
