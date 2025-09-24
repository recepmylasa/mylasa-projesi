// src/ProfileTabsMobile.js
import React from "react";
import "./ProfileTabsMobile.css";
import { Icon } from "./icons";

/** Izgaranın üstündeki 3 sekme — sprite tabanlı */
export default function ProfileTabsMobile({ mode="grid", onChange=()=>{} }) {
  return (
    <nav className="tabs-row" role="tablist" aria-label="İçerik türü">
      <button
        className={`tab-btn ${mode==="grid"?"active":""}`}
        role="tab"
        aria-selected={mode==="grid"}
        onClick={()=>onChange("grid")}
        aria-label="Gönderiler"
      >
        <Icon name="grid" size={22}/>
      </button>
      <button
        className={`tab-btn ${mode==="clips"?"active":""}`}
        role="tab"
        aria-selected={mode==="clips"}
        onClick={()=>onChange("clips")}
        aria-label="Reels"
      >
        <Icon name="reels" size={22}/>
      </button>
      <button
        className={`tab-btn ${mode==="tagged"?"active":""}`}
        role="tab"
        aria-selected={mode==="tagged"}
        onClick={()=>onChange("tagged")}
        aria-label="Etiketlenenler"
      >
        <Icon name="tagged" size={22}/>
      </button>
    </nav>
  );
}
