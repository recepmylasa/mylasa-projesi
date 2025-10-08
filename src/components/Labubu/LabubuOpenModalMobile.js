// src/components/Labubu/LabubuOpenModalMobile.js
import React, { useEffect, useMemo, useState } from "react";
import "./LabubuOpenModal.css";

/**
 * Mobile: aynı mantık, boyutlar mobil için optimize
 */
export default function LabubuOpenModalMobile({ card, drop, data, onClose }) {
  const item = card || drop || data || {};
  const title = item?.name || "KART";
  const rawAsset = item?.asset || "";
  const code = (item?.code || "").toString().toUpperCase();
  const nameToken =
    (item?.name || "").toString().trim().toUpperCase().replace(/\s+/g, "_") || "";

  const codeToken = useMemo(() => {
    const m = code.match(/^[A-Z0-9]+-(.+)$/);
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
    if (rawAsset) list.push(rawAsset);
    if (base) {
      list.push(`${base}.png`);
      list.push(`${base}.jpg`);
      list.push(`${base}.jpeg`);
      list.push(`${base}.webp`);
      list.push(`${base}.jpg.png`);
    }
    if (codeToken) {
      list.push(`/cards/S1/${codeToken}.png`);
      list.push(`/cards/S1/${codeToken}.jpg.png`);
      list.push(`/cards/S1/${codeToken}.jpg`);
    }
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
      <div className="labubu-modal labubu-modal--mobile">
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
          <button className="labubu-share" onClick={() => navigator.clipboard?.writeText(window.location.href)}>
            Paylaş
          </button>
          <button className="labubu-close" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}
