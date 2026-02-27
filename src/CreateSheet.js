// FILE: src/CreateSheet.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
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
import QuickCreateSheetMobile from "./QuickCreateSheetMobile";

/**
 * Alt sayfa (bottom sheet) — "Oluştur"
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - onSelect: (type: 'reel'|'post'|'story'|'highlight'|'live'|'ad'|'channel') => void
 *
 * ✅ Quick Create V0 (opsiyonel):
 * - enableQuickRouteCreate: boolean (default false)
 * - onRouteAdvanced: () => void  (mevcut map builder akışı)
 */
export default function CreateSheet({
  open = false,
  onClose = () => {},
  onSelect = () => {},

  enableQuickRouteCreate = false,
  onRouteAdvanced = null,
}) {
  const backdropRef = useRef(null);
  const sheetRef = useRef(null);
  const startY = useRef(0);
  const [dy, setDy] = useState(0);

  const [quickOpen, setQuickOpen] = useState(false);

  // Body scroll kilidi
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Parent kapatırsa quick de kapansın
  useEffect(() => {
    if (!open) setQuickOpen(false);
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

  const tryRouteAdvanced = useCallback(() => {
    if (typeof onRouteAdvanced === "function") {
      try {
        onRouteAdvanced();
        return;
      } catch {}
    }
    // fallback: listener varsa yakalar
    try {
      window.dispatchEvent(new CustomEvent("mylasa:openMap", { detail: { source: "create_sheet" } }));
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent("mylasa:navigate", { detail: { to: "map", source: "create_sheet" } }));
    } catch {}
  }, [onRouteAdvanced]);

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
          {enableQuickRouteCreate && (
            <>
              <SheetItem
                icon={<GridIcon />}
                label="Rota oluştur (yakında)"
                onClick={() => setQuickOpen(true)}
              />
              <SheetItem
                icon={<StoryIcon />}
                label="Haritada oluştur (gelişmiş)"
                onClick={() => {
                  onClose();
                  window.setTimeout(() => {
                    tryRouteAdvanced();
                  }, 0);
                }}
              />
            </>
          )}

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

      {/* ✅ Quick Create V0 */}
      <QuickCreateSheetMobile
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onContinueMap={() => {
          setQuickOpen(false);
          onClose();
          window.setTimeout(() => {
            tryRouteAdvanced();
          }, 0);
        }}
        onDraftCreated={() => {
          // V0: burada bir şey yapmıyoruz (local + toast QuickCreate içinde)
        }}
      />
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