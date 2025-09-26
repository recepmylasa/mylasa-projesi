import React from "react";
import "./ProfileTabsMobile.css";
import { GridIcon, ClipsIcon, TaggedIcon } from "./icons";

/** Izgaranın üstündeki 3 sekme — IG ölçüsünde */
export default function ProfileTabsMobile({ mode="grid", onChange=()=>{} }) {
  return (
    <nav className="tabs-row" role="tablist" aria-label="İçerik türü">
      <button className={`tab-btn ${mode==="grid"?"active":""}`} role="tab" aria-selected={mode==="grid"} onClick={()=>onChange("grid")} aria-label="Gönderiler">
        <GridIcon size={22}/>
      </button>
      <button className={`tab-btn ${mode==="clips"?"active":""}`} role="tab" aria-selected={mode==="clips"} onClick={()=>onChange("clips")} aria-label="Reels">
        <ClipsIcon size={22}/>
      </button>
      <button className={`tab-btn ${mode==="tagged"?"active":""}`} role="tab" aria-selected={mode==="tagged"} onClick={()=>onChange("tagged")} aria-label="Etiketlenenler">
        <TaggedIcon size={22}/>
      </button>
    </nav>
  );
}
