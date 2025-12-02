// src/pages/RoutesExploreMobile/components/EmptyStateMobile.jsx
// Explore ekranı için standart "boş" state bileşeni.

import React from "react";

function EmptyStateMobile({
  icon = "🗺️",
  title,
  description,
  primaryLabel,
  onPrimary,
}) {
  if (!title && !description) return null;

  return (
    <div
      className="explore-emptystate"
      style={{
        padding: "24px 8px 16px",
        textAlign: "center",
        color: "#4b5563",
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            fontSize: 32,
            marginBottom: 8,
          }}
        >
          {icon}
        </div>
      )}

      {title && (
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
      )}

      {description && (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.4,
            marginBottom: onPrimary && primaryLabel ? 10 : 0,
          }}
        >
          {description}
        </div>
      )}

      {onPrimary && primaryLabel && (
        <button
          type="button"
          onClick={onPrimary}
          style={{
            marginTop: 4,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {primaryLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyStateMobile;
