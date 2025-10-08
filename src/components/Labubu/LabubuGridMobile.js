// src/components/Labubu/LabubuGridMobile.js
import React from "react";
import "./Labubu.css";
import BoxTile from "./BoxTile";

/**
 * Mobil grid:
 * - Aynı görünüm; hover yok, tap’te hafif scale
 * - Akıllı src adayları
 * - Modal açarken çözülmüş src’yi asset olarak gönderir.
 */
export default function LabubuGridMobile({
  cards = [],
  boxesReady = 0,
  onOpenBox,
  onOpenCard,
}) {
  const buildCandidates = (c) => {
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
    const clean = (s) => (s || "").split("?")[0];
    const stripExt = (p) =>
      clean(p)
        .replace(/\.jpg\.png$/i, "")
        .replace(/\.(png|jpe?g|webp)$/i, "");

    const asset = c?.asset || "";
    const base = stripExt(asset);
    const codeToken = (() => {
      const code = (c?.code || "").toString().toUpperCase();
      const m = code.match(/^[A-Z0-9]+-(.+)$/);
      if (m) return m[1];
      if (code) return code;
      const name = (c?.name || "").toString().trim().toUpperCase().replace(/\s+/g, "_");
      return name || "";
    })();

    const list = [];
    if (asset) list.push(asset);
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
  };

  const handleErrorFactory = (candidates) => (e) => {
    const img = e.currentTarget;
    const idx = Number(img.dataset.try || 0);
    const next = candidates[idx + 1];
    if (next) {
      img.dataset.try = String(idx + 1);
      img.src = next;
    }
  };

  const preload = (url) => {
    if (!url) return;
    const i = new Image();
    i.decoding = "async";
    i.loading = "eager";
    i.src = url;
  };

  return (
    <div className="labubu-grid labubu-grid--mobile">
      <BoxTile count={boxesReady} onOpen={() => onOpenBox?.("standardBox")} />

      {cards.map((c) => {
        const candidates = buildCandidates(c);
        const src = candidates[0] || "/cards/_SILHOUETTE.jpg";
        preload(src);
        const onError = handleErrorFactory(candidates);

        return (
          <button
            key={c.code}
            className={`labubu-cell labubu-card labubu-card--mobile rarity-${c.rarity}`}
            onClick={() => onOpenCard?.({ ...c, asset: src })} // <<< ÖNEMLİ
            title={c.name}
          >
            <img
              className="labubu-thumb-img"
              src={src}
              alt={c.name}
              loading="lazy"
              decoding="async"
              data-try="0"
              onError={onError}
              draggable={false}
            />
            {c.count > 1 && <span className="labubu-count">×{c.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
