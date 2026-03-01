/* FILE: src/BottomNav.js */
import React from "react";
import "./BottomNav.css";

// Tüm ikonlar merkezi dosyadan
import { HomeIcon, SearchIcon, PlusIcon, ClipsIcon } from "./icons";

function BottomNav({ activeTab, onTabChange, profilePic }) {
  const size = 28;

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
        onClick={() => onTabChange("explore")}
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