// src/ProfileActionsSheetMobile.js
import React, { useEffect, useRef } from "react";
import "./ProfileActionsSheetMobile.css";
import { QrIcon, ExternalLinkIcon, KebabIcon, ChevronDownIcon } from "./icons";

const ACTIONS = [
  { id: "settings",        label: "Ayarlar",           emoji: "⚙️" },
  { id: "archive",         label: "Arşiv",             emoji: "🗂️" },
  { id: "close_friends",   label: "Yakın Arkadaşlar",  emoji: "🌟" },
  { id: "qr",              label: "QR Kodu",           emoji: null, Icon: QrIcon },
  { id: "saved",           label: "Kaydedilenler",     emoji: "🔖" },
  { id: "share_experience",label: "Deneyimi paylaş",   emoji: null, Icon: ExternalLinkIcon },
  { id: "accounts_center", label: "Hesap Merkezi…",    emoji: null, Icon: KebabIcon },
];

export default function ProfileActionsSheetMobile({ open, onClose, onSelect }) {
  const backdropRef = useRef(null);

  // ESC ile kapat
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Backdrop tıklaması ile kapat
  const handleBackdrop = (e) => {
    if (e.target === backdropRef.current) onClose?.();
  };

  return (
    <div
      className={`pas-backdrop ${open ? "open" : ""}`}
      onMouseDown={handleBackdrop}
      onTouchStart={handleBackdrop}
      ref={backdropRef}
      role="presentation"
    >
      <div
        className={`pas-sheet ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Profil seçenekleri"
      >
        <div className="pas-handle" />
        <div className="pas-title">Seçenekler</div>

        <div className="pas-list" role="menu">
          {ACTIONS.map(({ id, label, emoji, Icon }) => (
            <button
              key={id}
              type="button"
              className="pas-item"
              role="menuitem"
              onClick={() => onSelect?.(id)}
            >
              <span className="pas-icon" aria-hidden="true">
                {Icon ? <Icon size={20} /> : <span>{emoji}</span>}
              </span>
              <span className="pas-label">{label}</span>
            </button>
          ))}
        </div>

        <div className="pas-safe" />
      </div>
    </div>
  );
}
