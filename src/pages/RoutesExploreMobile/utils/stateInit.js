// src/pages/RoutesExploreMobile/utils/stateInit.js
import { readParam, readJSON } from "../../../utils/urlState";

export const DEFAULT_AUDIENCE = "all"; // "all" | "following"
export const DEFAULT_SORT = "near"; // "near" | "new" | "likes" | "rating"
export const DEFAULT_GROUP = "none"; // "none" | "city" | "country"

// ADIM 32: audience için yeni anahtar r_audience, eski anahtar legacy olarak korunuyor.
// DIM 34: r_sort + r_recentq ek.
export const LS_AUDIENCE = "r_audience";
export const LS_AUDIENCE_LEGACY = "routes.v1.audience";
export const LS_SORT_NEW = "r_sort";
export const LS_SORT = "routes.v1.sort";
export const LS_GROUP = "routes.v1.group";
export const LS_NEAR = "routes.v1.near";
export const LS_RADIUS = "routes.v1.radius";
export const LS_QUERY = "routes.v1.q";
// ADIM 33: seçili rota id’si
export const LS_SELECTED = "r_sel";
// DIM 34: son aramalar
export const LS_RECENT_Q = "r_recentq";

export function normalizeAudience(raw) {
  if (!raw) return DEFAULT_AUDIENCE;
  const v = String(raw).toLowerCase();
  if (v === "following" || v === "takip") return "following";
  return "all";
}

export function normalizeSort(raw) {
  const v = String(raw || "").toLowerCase();
  if (v === "near" || v === "yakın" || v === "nearby") return "near";
  if (
    v === "likes" ||
    v === "most_rated" ||
    v === "popular" ||
    v === "most_votes" ||
    v === "votes"
  ) {
    return "likes"; // "En çok oy"
  }
  if (v === "rating" || v === "top" || v === "top_rated") return "rating";
  if (v === "new" || v === "en_yeni") return "new";
  return DEFAULT_SORT;
}

export function normalizeGroup(raw) {
  const v = String(raw || "").toLowerCase();
  if (v === "city" || v === "şehir") return "city";
  if (v === "country" || v === "ülke") return "country";
  return DEFAULT_GROUP;
}

// ADIM 32 + 33: URL (m/a/s/q/sel) + localStorage(r_audience, r_sel) başlangıç durumu.
export function getInitialRouteUiState() {
  if (typeof window === "undefined") {
    return {
      audience: DEFAULT_AUDIENCE,
      sort: DEFAULT_SORT,
      group: DEFAULT_GROUP,
      near: null,
      radius: 5,
      query: "",
      selectedId: null,
    };
  }

  const urlModeRaw = readParam("m", null); // near | search
  let queryVal = (readParam("q", "") || "").toString();

  let audience = normalizeAudience(
    readParam("a", null) ?? readParam("aud", null)
  );
  let sort = normalizeSort(readParam("s", null) ?? readParam("sort", null));

  const urlGroupRaw =
    readParam("groupBy", null) ?? readParam("group", null);
  let group = normalizeGroup(urlGroupRaw);

  // localStorage fallback (önce yeni anahtarlar, sonra legacy)
  const lsAudNew = readJSON(LS_AUDIENCE, null);
  const lsAudLegacy = readJSON(LS_AUDIENCE_LEGACY, null);
  const lsSortNew = readJSON(LS_SORT_NEW, null);
  const lsSortLegacy = readJSON(LS_SORT, null);
  const lsGroup = readJSON(LS_GROUP, null);
  const lsNear = readJSON(LS_NEAR, null);
  const lsRadius = readJSON(LS_RADIUS, null);
  const lsQuery = readJSON(LS_QUERY, null);
  const lsSel = readJSON(LS_SELECTED, null);

  if (!audience && (lsAudNew || lsAudLegacy)) {
    audience = normalizeAudience(lsAudNew ?? lsAudLegacy);
  }
  if (!sort && (lsSortNew || lsSortLegacy)) {
    sort = normalizeSort(lsSortNew ?? lsSortLegacy);
  }
  if (!group && lsGroup) group = normalizeGroup(lsGroup);
  if (!queryVal && typeof lsQuery === "string") queryVal = lsQuery;

  const modeFromUrl =
    (urlModeRaw || "").toString().toLowerCase() === "search"
      ? "search"
      : "near";

  const isSearchLike =
    modeFromUrl === "search" ||
    (queryVal && queryVal.toString().trim().length > 0);

  if (!audience) audience = DEFAULT_AUDIENCE;
  if (!sort) {
    // ADIM 32: Arama modunda varsayılan "En yeni", aksi halde "Yakınımda"
    sort = isSearchLike ? "new" : DEFAULT_SORT;
  }
  if (!group) group = DEFAULT_GROUP;
  if (!queryVal) queryVal = "";

  let near = null;
  if (lsNear && typeof lsNear === "object") {
    const lat = Number(lsNear.lat);
    const lng = Number(lsNear.lng);
    const zoom = Number(lsNear.zoom);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      near = {
        lat,
        lng,
        zoom: Number.isFinite(zoom) ? zoom : 13,
      };
    }
  }

  let radius = Number(lsRadius);
  if (!Number.isFinite(radius) || radius <= 0) radius = 5;

  // ADIM 33: sel paramı + localStorage r_sel
  let selectedId = null;
  const selParam = readParam("sel", null);
  if (typeof selParam === "string" && selParam.trim()) {
    selectedId = selParam.trim();
  } else if (typeof lsSel === "string" && lsSel.trim()) {
    selectedId = lsSel.trim();
  }

  return { audience, sort, group, near, radius, query: queryVal, selectedId };
}

export function getInitialRouteFilters() {
  if (typeof window === "undefined") {
    return {
      tags: [],
      city: "",
      country: "",
      dist: [0, 50], // km
      dur: [0, 300], // dk
    };
  }

  const city = (readParam("city", "") || "").toString();
  const country = (readParam("country", "") || "").toString();
  const tagsRaw = readParam("tags", null);
  let tags = [];

  if (typeof tagsRaw === "string" && tagsRaw.trim()) {
    tags = tagsRaw
      .split(/[,\s]+/g)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10);
  }

  return {
    tags,
    city,
    country,
    dist: [0, 50],
    dur: [0, 300],
  };
}
