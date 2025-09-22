// src/ProfileTabsMobile.jsx
import React from "react";
import "./ProfileTabsMobile.css";
import { GridIcon, ClipsIcon, TaggedIcon, SavedIcon } from "./icons";

export default function ProfileTabsMobile({
  mode = "grid",
  onChange = () => {},
  showSavedTab = false, // kendi profilinde görünür
}) {
  const cols = showSavedTab ? "repeat(4,1fr)" : "repeat(3,1fr)";

  return (
    <nav
      className="ptm sticky-top"
      role="tablist"
      aria-label="Profil sekmeleri"
      style={{ gridTemplateColumns: cols }}
    >
      {/* Gönderiler */}
      <a
        href="#"
        role="tab"
        aria-selected={mode === "grid"}
        aria-controls="tab-panel-grid"
        className={`ptm-tab ${mode === "grid" ? "active" : ""}`}
        onClick={(e) => { e.preventDefault(); onChange("grid"); }}
        aria-label="Gönderiler"
        title="Gönderiler"
      >
        <GridIcon size={24} />
      </a>

      {/* Klipler */}
      <a
        href="#"
        role="tab"
        aria-selected={mode === "clips"}
        aria-controls="tab-panel-clips"
        className={`ptm-tab ${mode === "clips" ? "active" : ""}`}
        onClick={(e) => { e.preventDefault(); onChange("clips"); }}
        aria-label="Klipler"
        title="Klipler"
      >
        <ClipsIcon size={24} />
      </a>

      {/* Etiketlenenler */}
      <a
        href="#"
        role="tab"
        aria-selected={mode === "tagged"}
        aria-controls="tab-panel-tagged"
        className={`ptm-tab ${mode === "tagged" ? "active" : ""}`}
        onClick={(e) => { e.preventDefault(); onChange("tagged"); }}
        aria-label="Etiketlenenler"
        title="Etiketlenenler"
      >
        <TaggedIcon size={24} />
      </a>

      {/* Kaydedilenler (sadece kendi profili) */}
      {showSavedTab && (
        <a
          href="#"
          role="tab"
          aria-selected={mode === "saved"}
          aria-controls="tab-panel-saved"
          className={`ptm-tab ${mode === "saved" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); onChange("saved"); }}
          aria-label="Kaydedilenler"
          title="Kaydedilenler"
        >
          <SavedIcon active={mode === "saved"} size={24} />
        </a>
      )}
    </nav>
  );
}
