// src/components/Labubu/LabubuOpenModalDesktop.js
import React, { useEffect, useMemo, useState } from "react";
import "./LabubuOpenModal.css";

/**
 * Desktop: Kutudan çıkan kart modalı
 * - asset/code/name'den aday URL listesi üretir
 * - preload + fallback ile çalışan tek bir görsel src'ye çözer
 * - <img> + object-fit:contain; taşma yok
 */
export default function LabubuOpenModalDesktop({ card, drop, data, onClose }) {
  const item = card || drop || data || {};
  const title = item?.name || "KART";
  const rawAsset = item?.asset || "";
  const code = (item?.code || "").toString().toUpperCase();
  const nameToken =
    (item?.name || "").toString().trim().toUpperCase().replace(/\s+/g, "_") || "";

  const codeToken = useMemo(() => {
    const m = code.match(/^[A-Z0-9]+-(.+)$/); // S1-LOVE -> LOVE
    if (m) return m[1];
    if (code) return code;
    return nameToken;
  }, [code, nameToken]);

  const candidates = useMemo(() => {
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
    const clean = (s) => (s || "").split("?")[0];
    const stripExt = (p) =>
      clean(p)
        .replace(/\.jpg\.png$/i, "")
        .replace(/\.(png|jpe?g|webp)$/i, "");

    const list = [];
    const base = stripExt(rawAsset || "");

    // 1) backend'in verdiği tam yol
    if (rawAsset) list.push(rawAsset);

    // 2) uzantı varyantları
    if (base) {
      list.push(`${base}.png`);
      list.push(`${base}.jpg`);
      list.push(`${base}.jpeg`);
      list.push(`${base}.webp`);
      list.push(`${base}.jpg.png`);
    }

    // 3) güvenli code tabanlı yollar
    if (codeToken) {
      list.push(`/cards/S1/${codeToken}.png`);
      list.push(`/cards/S1/${codeToken}.jpg.png`);
      list.push(`/cards/S1/${codeToken}.jpg`);
    }

    // 4) son çare
    list.push(`/cards/_SILHOUETTE.jpg`);
    return uniq(list);
  }, [rawAsset, codeToken]);

  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tryNext = (i) => {
      const url = candidates[i];
      if (!url) {
        if (!cancelled) {
          setSrc("/cards/_SILHOUETTE.jpg");
          setLoading(false);
        }
        return;
      }
      const im = new Image();
      im.onload = () => {
        if (!cancelled) {
          setSrc(url);
          setLoading(false);
        }
      };
      im.onerror = () => tryNext(i + 1);
      im.decoding = "async";
      im.loading = "eager";
      im.src = url;
    };
    setLoading(true);
    tryNext(0);
    return () => { cancelled = true; };
  }, [candidates]);

  return (
    <div className="labubu-modal-overlay" role="dialog" aria-modal="true">
      <div className="labubu-modal">
        <div className="labubu-modal-header">
          <div className="labubu-title">Kutudan çıkan kart</div>
          <button className="labubu-close-x" onClick={onClose} aria-label="Kapat">×</button>
        </div>

        <div className="labubu-chip">{title}</div>

        <div className="labubu-cardwrap">
          {loading ? (
            <div className="labubu-skeleton" />
          ) : (
            <img
              className="labubu-cardbig-img"
              src={src}
              alt={title}
              draggable={false}
            />
          )}
        </div>

        <div className="labubu-modal-footer">
          <button
            className="labubu-share"
            onClick={() => navigator.clipboard?.writeText(window.location.href)}
          >
            Paylaş
          </button>
          <button className="labubu-close" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}
