// src/ProfileTabsMobile.js
import React from "react";
import "./ProfileTabsMobile.css";
import { GridIcon, ClipsIcon, CheckinIcon, CardsIcon } from "./icons";

/** Izgaranın üstündeki sekmeler — IG ölçüsünde (tek satır, sığdırma) */
export default function ProfileTabsMobile({
  mode = "grid",
  onChange = () => {},
  showSavedTab = false,      // mevcut davranış: mobilde ikon olarak göstermiyoruz
  showCollectionTab = false, // kart/kutu sekmesi
}) {
  return (
    <nav className="tabs-row" role="tablist" aria-label="İçerik türü">
      <button
        className={`tab-btn ${mode === "grid" ? "active" : ""}`}
        role="tab"
        aria-selected={mode === "grid"}
        onClick={() => onChange("grid")}
        aria-label="Gönderiler"
      >
        <GridIcon size={22} />
      </button>

      <button
        className={`tab-btn ${mode === "clips" ? "active" : ""}`}
        role="tab"
        aria-selected={mode === "clips"}
        onClick={() => onChange("clips")}
        aria-label="Klipler"
      >
        <ClipsIcon size={22} />
      </button>

      <button
        className={`tab-btn ${mode === "checkins" ? "active" : ""}`}
        role="tab"
        aria-selected={mode === "checkins"}
        onClick={() => onChange("checkins")}
        aria-label="Check-inler"
      >
        <CheckinIcon size={22} />
      </button>

      {showCollectionTab && (
        <button
          className={`tab-btn ${mode === "collection" ? "active" : ""}`}
          role="tab"
          aria-selected={mode === "collection"}
          onClick={() => onChange("collection")}
          aria-label="Koleksiyon"
        >
          <CardsIcon size={22} />
        </button>
      )}
      {/* Saved: mobilde ikon sekmesi göstermiyoruz (mevcut davranış) */}
    </nav>
  );
}
