// src/components/MapTypeMenu.jsx
import React, { forwardRef } from "react";

const MapTypeMenu = forwardRef(function MapTypeMenu({ open, mapTypes, onSelect }, ref) {
  if (!open) return null;
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "0",
        right: "50px",
        backgroundColor: "white",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
        overflow: "hidden",
        width: "150px",
        zIndex: 20,
      }}
    >
      {Object.keys(mapTypes).map((label) => (
        <button
          key={label}
          onClick={() => onSelect(mapTypes[label])}
          style={{
            display: "block",
            width: "100%",
            padding: "12px 16px",
            background: "none",
            border: "none",
            textAlign: "left",
            cursor: "pointer",
            borderBottom: "1px solid #efefef",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
});

export default MapTypeMenu;
