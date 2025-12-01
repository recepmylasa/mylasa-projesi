// src/pages/RoutesExploreMobile/utils/recentSearches.js

import { LS_RECENT_Q } from "./stateInit";
import { readJSON, writeJSON } from "../../../utils/urlState";

// DIM 34: Son aramalar için başlangıç listesi
export function getInitialRecentQueries() {
  if (typeof window === "undefined") return [];
  const stored = readJSON(LS_RECENT_Q, null);
  if (!Array.isArray(stored)) return [];
  return stored
    .map((v) => (v == null ? "" : String(v)))
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 6);
}

// Mevcut liste + yeni sorgu → güncellenmiş liste (LS ile birlikte)
export function bumpRecentQuery(prevList, raw) {
  const q = (raw || "").toString().trim();
  if (!q) return Array.isArray(prevList) ? prevList : [];

  const existing = Array.isArray(prevList) ? prevList : [];
  const filtered = existing.filter(
    (item) => item.toLowerCase() !== q.toLowerCase()
  );
  const next = [q, ...filtered].slice(0, 6);

  try {
    writeJSON(LS_RECENT_Q, next);
  } catch {
    // no-op
  }

  return next;
}

// Listeyi temizler (LS + bellek)
export function clearRecentQueries() {
  try {
    writeJSON(LS_RECENT_Q, []);
  } catch {
    // no-op
  }
  return [];
}
