// src/CreateSheet.jsx
import React, { useEffect, useRef, useState } from "react";
import "./CreateSheet.css";
import {
  PlusIcon,
  ClipsIcon,
  GridIcon,
  StoryIcon,
  HighlightIcon,
  LiveIcon,
  AdsIcon,
  ChannelIcon,
} from "./icons";

/**
 * Alt sayfa (bottom sheet) — "Oluştur"
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - onSelect: (type: 'reel'|'post'|'story'|'highlight'|'live'|'ad'|'channel') => void
 */
export default function CreateSheet({ open = false, onClose = () => {}, onSelect = () => {} }) {
  const backdropRef = useRef(null);
  const sheetRef = useRef(null);
  const startY = useRef(0);
  const [dy, setDy] = useState(0);

  // Body scroll kilidi
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Basit sürükle-aşağı kapatma
  useEffect(() => {
    const el = sheetRef.current;
    if (!open || !el) return;

    const onTouchStart = (e) => {
      startY.current = e.touches?.[0]?.clientY ?? 0;
      setDy(0);
    };
    const onTouchMove = (e) => {
      const y = e.touches?.[0]?.clientY ?? 0;
      const delta = Math.max(0, y - startY.current);
      setDy(delta);
    };
    const onTouchEnd = () => {
      if (dy > 80) onClose(); // eşik
      setDy(0);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [open, dy, onClose]);

  return (
    <>
      {open && <div className="cs-backdrop" ref={backdropRef} onClick={onClose} aria-hidden="true" />}
      <div
        className={`cs-sheet ${open ? "open" : ""}`}
        ref={sheetRef}
        style={{ transform: open ? `translateY(${dy}px)` : "" }}
        role="dialog"
        aria-modal="true"
        aria-label="Oluştur"
      >
        <div className="cs-handle" />
        <h3 className="cs-title">
          <PlusIcon size={20} /> Oluştur
        </h3>
        <div className="cs-list">
          <SheetItem icon={<ClipsIcon />} label="Reels videosu" onClick={() => onSelect("reel")} />
          <SheetItem icon={<GridIcon />} label="Gönderi" onClick={() => onSelect("post")} />
          <SheetItem icon={<StoryIcon />} label="Hikâye" onClick={() => onSelect("story")} />
          <SheetItem icon={<HighlightIcon />} label="Öne çıkan hikâye" onClick={() => onSelect("highlight")} />
          <SheetItem icon={<LiveIcon />} label="Canlı" onClick={() => onSelect("live")} />
          <SheetItem icon={<AdsIcon />} label="Reklam" onClick={() => onSelect("ad")} />
          <SheetItem icon={<ChannelIcon />} label="Kanal" onClick={() => onSelect("channel")} />
        </div>
        <div className="cs-safe" />
      </div>
    </>
  );
}

function SheetItem({ icon, label, onClick }) {
  return (
    <button type="button" className="cs-item" onClick={onClick}>
      <span className="cs-icon">{icon}</span>
      <span className="cs-label">{label}</span>
    </button>
  );
}
