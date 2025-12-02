// src/pages/RoutesExploreMobile/components/ChipRowMobile.jsx
// Yakınımda / En yeni / En çok oy / En yüksek puan + grup badge.

import React from "react";

function ChipRowMobile({
  sort,
  groupLabel,
  onChangeSort,
  onOpenFilter,
}) {
  return (
    <div
      className="routes-chiprow"
      aria-label="Rota sıralama seçenekleri"
    >
      <button
        type="button"
        className={"chip" + (sort === "near" ? " chip--active" : "")}
        onClick={() => onChangeSort("near")}
        aria-pressed={sort === "near"}
        aria-current={sort === "near" ? "true" : undefined}
      >
        Yakınımda
      </button>
      <button
        type="button"
        className={"chip" + (sort === "new" ? " chip--active" : "")}
        onClick={() => onChangeSort("new")}
        aria-pressed={sort === "new"}
        aria-current={sort === "new" ? "true" : undefined}
      >
        En yeni
      </button>
      <button
        type="button"
        className={"chip" + (sort === "likes" ? " chip--active" : "")}
        onClick={() => onChangeSort("likes")}
        aria-pressed={sort === "likes"}
        aria-current={sort === "likes" ? "true" : undefined}
      >
        En çok oy
      </button>
      <button
        type="button"
        className={"chip" + (sort === "rating" ? " chip--active" : "")}
        onClick={() => onChangeSort("rating")}
        aria-pressed={sort === "rating"}
        aria-current={sort === "rating" ? "true" : undefined}
      >
        En yüksek puan
      </button>

      {groupLabel && (
        <button
          type="button"
          className="routes-badge"
          onClick={onOpenFilter}
        >
          Grup: {groupLabel}
        </button>
      )}
    </div>
  );
}

export default ChipRowMobile;
