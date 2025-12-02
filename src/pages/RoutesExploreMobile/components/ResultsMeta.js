// src/pages/RoutesExploreMobile/components/ResultsMeta.jsx
// Arama sonuç sayacı – "Sonuçlar • X sonuç"

import React from "react";

function ResultsMeta({ totalCount }) {
  if (typeof totalCount !== "number") return null;

  return (
    <div className="routes-results-meta">
      <span className="routes-results-title">Sonuçlar</span>
      <span className="routes-results-count">
        {totalCount} sonuç
      </span>
    </div>
  );
}

export default ResultsMeta;
