import React from "react";
import "./ProfileTabsDesktop.css";
import {
  GridIcon,
  ClipsIcon,
  CheckinIcon,
  StarIcon,
  SavedIcon,
  TaggedIcon,
} from "./icons";

/**
 * Masaüstü profil sekmeleri (yalnız ikon)
 * - Metin YOK; hover’da tarayıcı tooltip’i (title) görünür.
 * - Erişilebilirlik için sr-only label var.
 * - Satır tek satır; alta geçmez.
 */
export default function ProfileTabsDesktop({
  mode = "grid",
  onChange = () => {},
  showSavedTab = true,
  showCollectionTab = true,
  showTaggedTab = true,
  showCheckinsTab = true,
}) {
  return (
    <nav className="tabs-desktop" role="tablist" aria-label="Profil sekmeleri">
      <button
        type="button"
        className={`tab-btn ${mode === "grid" ? "active" : ""}`}
        role="tab"
        aria-selected={mode === "grid"}
        onClick={() => onChange("grid")}
        title="Gönderiler"
      >
        <GridIcon size={22} />
        <span className="sr-only">Gönderiler</span>
      </button>

      <button
        type="button"
        className={`tab-btn ${mode === "clips" ? "active" : ""}`}
        role="tab"
        aria-selected={mode === "clips"}
        onClick={() => onChange("clips")}
        title="Klipler"
      >
        <ClipsIcon size={22} />
        <span className="sr-only">Klipler</span>
      </button>

      {showCheckinsTab && (
        <button
          type="button"
          className={`tab-btn ${mode === "checkins" ? "active" : ""}`}
          role="tab"
          aria-selected={mode === "checkins"}
          onClick={() => onChange("checkins")}
          title="Konumlar"
        >
          <CheckinIcon size={22} />
          <span className="sr-only">Konumlar</span>
        </button>
      )}

      {showCollectionTab && (
        <button
          type="button"
          className={`tab-btn ${mode === "collection" ? "active" : ""}`}
          role="tab"
          aria-selected={mode === "collection"}
          onClick={() => onChange("collection")}
          title="Koleksiyon"
        >
          <StarIcon size={22} />
          <span className="sr-only">Koleksiyon</span>
        </button>
      )}

      {showSavedTab && (
        <button
          type="button"
          className={`tab-btn ${mode === "saved" ? "active" : ""}`}
          role="tab"
          aria-selected={mode === "saved"}
          onClick={() => onChange("saved")}
          title="Kaydedilenler"
        >
          <SavedIcon size={22} />
          <span className="sr-only">Kaydedilenler</span>
        </button>
      )}

      {showTaggedTab && (
        <button
          type="button"
          className={`tab-btn ${mode === "tagged" ? "active" : ""}`}
          role="tab"
          aria-selected={mode === "tagged"}
          onClick={() => onChange("tagged")}
          title="Etiketlenenler"
        >
          <TaggedIcon size={22} />
          <span className="sr-only">Etiketlenenler</span>
        </button>
      )}
    </nav>
  );
}
