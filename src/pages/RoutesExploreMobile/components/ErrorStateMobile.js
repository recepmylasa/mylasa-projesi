// src/pages/RoutesExploreMobile/components/ErrorStateMobile.jsx
// Explore ekranı için standart "hata" state bileşeni.

import React from "react";

function ErrorStateMobile({
  icon = "⚠️",
  title = "Bir şeyler ters gitti",
  description,
  primaryLabel,
  onPrimary,
}) {
  return (
    <div
      className="explore-errorstate"
      style={{
        padding: "16px 10px 12px",
        textAlign: "center",
        color: "#b91c1c",
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            fontSize: 28,
            marginBottom: 6,
          }}
        >
          {icon}
        </div>
      )}
      {title && (
        <div
          style={{
            fontSize: 13,
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
            fontSize: 11,
            lineHeight: 1.4,
            opacity: 0.9,
            marginBottom: onPrimary && primaryLabel ? 8 : 0,
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
            marginTop: 2,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #fecaca",
            backgroundColor: "#fef2f2",
            fontSize: 11,
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

export default ErrorStateMobile;
