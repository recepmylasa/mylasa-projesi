// src/components/SearchOverlay.jsx
import React, { forwardRef } from "react";
import { SearchIcon } from "../icons"; // gerekirse yol: "./icons"

const SearchOverlay = forwardRef(function SearchOverlay(
  {
    open,
    inputWidth,
    searchText,
    setSearchText,
    predictions,
    onClose,
    onSelectPrediction,
  },
  ref
) {
  if (!open) return null;
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 12,
        left: 0,
        right: 0,
        zIndex: 20,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "auto",
      }}
    >
      <div style={{ width: inputWidth }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 10px",
            gap: 8,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            borderRadius: 22,
            boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
          }}
        >
          <SearchIcon size={18} color="#fff" />
          <input
            className="mylasa-search-input"
            autoFocus
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Yer ara…"
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              fontSize: 16,
              background: "transparent",
              color: "#fff",
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              color: "#fff",
              lineHeight: 1,
            }}
            title="Kapat"
          >
            ✖
          </button>
        </div>

        {predictions.length > 0 && (
          <div
            className="mylasa-search-scroll"
            style={{
              marginTop: 8,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              borderRadius: 12,
              boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {predictions.map((p) => (
              <button
                key={p.place_id}
                onClick={() => onSelectPrediction(p)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.18)",
                  cursor: "pointer",
                  color: "#fff",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {p.structured_formatting?.main_text || p.description}
                </div>
                {p.structured_formatting?.secondary_text && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {p.structured_formatting.secondary_text}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default SearchOverlay;
