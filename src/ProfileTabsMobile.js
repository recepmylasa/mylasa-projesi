// src/ProfileTabsMobile.js
import React from "react";
import "./ProfileTabsMobile.css";
import { GridIcon, ClipsIcon, CheckinIcon, CardsIcon } from "./icons";

// Basit inline rota ikonu
function RouteIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 20c0-3 2-5 5-5h2a5 5 0 000-10h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="6" cy="20" r="2" fill="currentColor" />
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="18" cy="10" r="2" fill="currentColor" />
    </svg>
  );
}

/** Izgaranın üstündeki sekmeler — IG ölçüsünde */
export default function ProfileTabsMobile({
  mode = "grid",
  onChange = () => {},
  showSavedTab = false,
  showCollectionTab = false,
}) {
  return (
    <nav className="tabs-row" role="tablist" aria-label="İçerik türü">
      <button className={`tab-btn ${mode === "grid" ? "active" : ""}`} role="tab" aria-selected={mode === "grid"} onClick={() => onChange("grid")} aria-label="Gönderiler">
        <GridIcon size={22} />
      </button>

      <button className={`tab-btn ${mode === "clips" ? "active" : ""}`} role="tab" aria-selected={mode === "clips"} onClick={() => onChange("clips")} aria-label="Klipler">
        <ClipsIcon size={22} />
      </button>

      <button className={`tab-btn ${mode === "checkins" ? "active" : ""}`} role="tab" aria-selected={mode === "checkins"} onClick={() => onChange("checkins")} aria-label="Check-inler">
        <CheckinIcon size={22} />
      </button>

      {/* Rotalarım */}
      <button className={`tab-btn ${mode === "routes" ? "active" : ""}`} role="tab" aria-selected={mode === "routes"} onClick={() => onChange("routes")} aria-label="Rotalarım" title="Rotalarım">
        <RouteIcon size={22} />
      </button>

      {showCollectionTab && (
        <button className={`tab-btn ${mode === "collection" ? "active" : ""}`} role="tab" aria-selected={mode === "collection"} onClick={() => onChange("collection")} aria-label="Koleksiyon">
          <CardsIcon size={22} />
        </button>
      )}
      {/* Saved: mobilde ikon sekmesi göstermiyoruz */}
    </nav>
  );
}
