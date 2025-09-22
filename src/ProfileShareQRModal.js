// src/ProfileShareQRModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ProfileShareQRModal.css";
import { QrIcon, ShareIcon } from "./icons";

/**
 * QR Paylaş modal
 * - open, onClose
 * - url: string  (zorunlu)
 * - username?: string (başlık)
 *
 * QR üretimi: Dinamik olarak CDN'den `qrcode` script yüklenir.
 * CDN başarısız olursa link kartı + kopyala fallback çalışır.
 */
export default function ProfileShareQRModal({ open = false, onClose = () => {}, url = "", username = "" }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState("light"); // light | dark | indigo | gradient
  const [err, setErr] = useState("");

  // Body scroll kilidi
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // QR kütüphanesini yükle
  useEffect(() => {
    if (!open) return;
    setErr("");
    if (window.QRCode) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
    s.async = true;
    s.onload = () => setReady(true);
    s.onerror = () => setErr("QR kütüphanesi yüklenemedi.");
    document.head.appendChild(s);
    return () => { /* script kalabilir */ };
  }, [open]);

  // QR çiz
  useEffect(() => {
    if (!open || !ready || !url || !canvasRef.current || !window.QRCode) return;
    const canvas = canvasRef.current;
    const colors = colorSet(theme);
    try {
      window.QRCode.toCanvas(canvas, url, {
        width: 520,
        margin: 2,
        color: { dark: colors.dark, light: colors.light },
      });
    } catch (e) {
      setErr("QR oluşturulamadı.");
    }
  }, [open, ready, url, theme]);

  const cardClass = useMemo(() => `pqr-card theme-${theme}`, [theme]);

  const doCopy = async () => {
    try {
      await navigator.clipboard?.writeText(url);
      alert("Bağlantı kopyalandı.");
    } catch {}
  };

  const doDownload = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const a = document.createElement("a");
      a.download = "mylasa-profile-qr.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch {}
  };

  const doShare = async () => {
    const title = `${username || "Profil"} • Mylasa`;
    if (navigator?.share) {
      try { await navigator.share({ title, url }); return; } catch {}
    }
    doCopy();
  };

  return (
    <>
      {open && <div className="pqr-backdrop" onClick={onClose} aria-hidden="true" />}
      <div className={`pqr-modal ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="Profili paylaş (QR)">
        <div className="pqr-header">
          <div className="pqr-drag" />
          <div className="pqr-title"><QrIcon /> Profili paylaş</div>
        </div>

        {/* Renk seçenekleri */}
        <div className="pqr-theme">
          {["light","dark","indigo","gradient"].map((t) => (
            <button
              key={t}
              type="button"
              className={`pqr-theme-btn ${theme === t ? "active" : ""} ${t}`}
              onClick={() => setTheme(t)}
              aria-label={`Tema: ${t}`}
            />
          ))}
        </div>

        {/* QR kartı */}
        <div className={cardClass}>
          <div className="pqr-username">{username || "Profil"}</div>
          <div className="pqr-qrbox">
            <canvas ref={canvasRef} width={520} height={520} />
          </div>
          <div className="pqr-url" title={url}>{url}</div>
        </div>

        {err && <div className="pqr-error">{err}</div>}

        {/* Aksiyonlar */}
        <div className="pqr-actions">
          <button type="button" className="pqr-btn" onClick={doShare}><ShareIcon /> Paylaş</button>
          <button type="button" className="pqr-btn" onClick={doCopy}>Bağlantıyı kopyala</button>
          <button type="button" className="pqr-btn" onClick={doDownload}>İndir</button>
          <button type="button" className="pqr-btn secondary" onClick={onClose}>Kapat</button>
        </div>

        <div className="pqr-safe" />
      </div>
    </>
  );
}

function colorSet(theme) {
  switch (theme) {
    case "dark": return { light: "#111111", dark: "#ffffff" };
    case "indigo": return { light: "#eef2ff", dark: "#3730a3" };
    case "gradient": return { light: "#ffffff", dark: "#111111" }; // arka plan gradient, QR koyu
    default: return { light: "#ffffff", dark: "#111111" };
  }
}
