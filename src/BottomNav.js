/* FILE: src/BottomNav.js */
import React, { useCallback } from "react";
import "./BottomNav.css";
import "./styles/myLive.css";

// Tüm ikonlar merkezi dosyadan
import { HomeIcon, SearchIcon, PlusIcon, ClipsIcon } from "./icons";

function BottomNav({ activeTab, onTabChange, profilePic }) {
  const size = 28;

  // ✅ EMİR 2/3: büyüteç artık rota sistemi değil, gerçek keşfet/arama (/explore)
  // App.js mobilde explore tab'ını /explore/routes'a set ediyor olabilir.
  // Burada history override + popstate tetikleyerek kesin şekilde /explore'a döndürüyoruz.
  const handleExploreClick = useCallback(() => {
    try {
      onTabChange("explore");
    } catch {}

    try {
      const target = "/explore";
      if (typeof window !== "undefined") {
        if (window.location.pathname !== target) {
          window.history.pushState({}, "", target);
        } else {
          // aynı path olsa bile renderPageContent path bazlıdır; popstate ile sync yapalım
          window.history.replaceState({}, "", target);
        }

        try {
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch {
          // çok eski browser fallback
          window.dispatchEvent(new Event("popstate"));
        }
      }
    } catch {}
  }, [onTabChange]);

  return (
    <nav className="bottom-nav-container">
      {/* Ana Sayfa */}
      <button
        onClick={() => onTabChange("home")}
        className="bottom-nav-btn"
        title="Ana Sayfa"
        type="button"
      >
        <HomeIcon
          className="nav-icon"
          size={size}
          weight={activeTab === "home" ? "fill" : "regular"}
        />
      </button>

      {/* Keşfet */}
      <button
        onClick={handleExploreClick}
        className="bottom-nav-btn"
        title="Keşfet"
        type="button"
      >
        <SearchIcon
          className="nav-icon"
          size={size}
          weight={activeTab === "explore" ? "fill" : "regular"}
        />
      </button>

      {/* Oluştur */}
      <button
        onClick={() => onTabChange("createMenu")}
        className="bottom-nav-btn"
        title="Oluştur"
        type="button"
      >
        <PlusIcon className="nav-icon" size={size} weight="regular" />
      </button>

      {/* Klipler — FourK */}
      <button
        onClick={() => onTabChange("clips")}
        className="bottom-nav-btn"
        title="Clips"
        type="button"
      >
        <ClipsIcon
          className="nav-icon"
          size={size}
          weight={activeTab === "clips" ? "fill" : "regular"}
        />
      </button>

      {/* Profil */}
      <button
        onClick={() => onTabChange("profile")}
        className="bottom-nav-btn"
        title="Profil"
        type="button"
      >
        {profilePic ? (
          <img
            src={profilePic}
            alt="Profil"
            className={`bottom-nav-profile-pic ${
              activeTab === "profile" ? "active" : ""
            }`}
          />
        ) : (
          <div
            className={`bottom-nav-profile-pic ${
              activeTab === "profile" ? "active" : ""
            }`}
            style={{ background: "#e0e0e0" }}
          />
        )}
      </button>
    </nav>
  );
}

export default BottomNav;