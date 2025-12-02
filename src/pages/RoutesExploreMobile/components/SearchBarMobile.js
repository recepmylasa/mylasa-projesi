// src/pages/RoutesExploreMobile/components/SearchBarMobile.jsx
// Yalnızca arama barı + "Son aramalar" UI’si (davranış props’tan gelir).

import React from "react";

function SearchBarMobile({
  searchText,
  onChange,
  loadingSearch,
  showRecentList,
  recentQueries,
  onFocus,
  onBlur,
  onKeyDown,
  onClear,
  onRecentClick,
  onRecentClear,
}) {
  return (
    <>
      <div
        className="routes-search-row"
        style={{
          padding: "4px 10px 6px",
          background: "#ffffff",
        }}
      >
        <div className="routes-search-input-wrap">
          <input
            type="search"
            className="search-input"
            placeholder="Rota ara (başlık, açıklama, şehir...)"
            value={searchText}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            autoComplete="off"
            enterKeyHint="search"
            style={{
              fontSize: 14,
            }}
          />
          {loadingSearch && (
            <span
              className="routes-explore-search-spinner"
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            className="routes-search-clear"
            onClick={onClear}
            disabled={!searchText}
            aria-label="Aramayı temizle"
          >
            ✕
          </button>
        </div>
      </div>

      {showRecentList && (
        <div className="routes-explore-recent">
          <div className="routes-explore-recent-inner">
            <div className="routes-explore-recent-header">
              <span>Son aramalar</span>
              <button
                type="button"
                className="routes-explore-recent-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onRecentClear}
              >
                <span>Temizle</span>
                <span aria-hidden="true">🗑</span>
              </button>
            </div>
            <div className="routes-explore-recent-list">
              {recentQueries.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="routes-explore-recent-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onRecentClick(q)}
                >
                  <span className="routes-explore-recent-text">
                    {q}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SearchBarMobile;
