// src/components/MapTopControls.jsx
import React from "react";
import { darkCircleBtn } from "../constants/map";
import { SearchIcon, LayersIcon, SettingsIcon } from "../icons"; // projendeki yol: "./icons" ise düzelt
// Not: icons import yolunu ihtiyacına göre düzelt: "../icons" veya "./icons"

export default function MapTopControls({
  selfAvatarUrl,
  onOpenAvatar,
  onToggleSettings,
  onToggleLayers,
  onToggleSearch,
  searchBtnRef,
  layersBtnRef,
  settingsBtnRef,
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "70px",
        right: "10px",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <button
        onClick={onOpenAvatar}
        title="Avatarını Değiştir"
        style={{ ...darkCircleBtn, padding: 4, overflow: "hidden" }}
      >
        <img
          src={selfAvatarUrl}
          alt="avatar"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            objectFit: "contain",
            objectPosition: "center",
            display: "block",
          }}
        />
      </button>

      <button
        ref={settingsBtnRef}
        style={darkCircleBtn}
        onClick={onToggleSettings}
        title="Konum Ayarları"
      >
        <SettingsIcon size={22} color="#fff" />
      </button>

      <button
        ref={layersBtnRef}
        style={darkCircleBtn}
        onClick={onToggleLayers}
        title="Harita Katmanları"
      >
        <LayersIcon size={22} color="#fff" />
      </button>

      <button
        ref={searchBtnRef}
        style={darkCircleBtn}
        onClick={onToggleSearch}
        title="Yer Ara"
      >
        <SearchIcon size={22} color="#fff" />
      </button>
    </div>
  );
}
