// src/pages/RoutesExploreMobile/hooks/useExploreParamsSync.js
// Amaç: m/a/s/q/sel + groupBy/city/country/tags paramlarını ve
// LS_AUDIENCE, LS_SORT_NEW, LS_SORT, LS_GROUP, LS_QUERY, LS_SELECTED
// yazımını + popstate geri yüklemesini tek yerde toplamak.

import { useEffect } from "react";
import {
  readParam,
  pushParams,
  writeJSON,
} from "../../../utils/urlState";

import {
  DEFAULT_AUDIENCE,
  DEFAULT_SORT,
  DEFAULT_GROUP,
  LS_AUDIENCE,
  LS_AUDIENCE_LEGACY,
  LS_SORT_NEW,
  LS_SORT,
  LS_GROUP,
  LS_QUERY,
  LS_SELECTED,
  normalizeAudience,
  normalizeSort,
  normalizeGroup,
} from "../utils/stateInit";

export default function useExploreParamsSync({ state, setters }) {
  const { audience, sort, group, filters, searchText, selectedRouteId } =
    state || {};

  const {
    setAudience,
    setSort,
    setGroup,
    setFilters,
    setSearchText,
    setSelectedRouteId,
  } = setters || {};

  // URL + LocalStorage yazımı (m/a/s/q/sel + groupBy/city/country/tags)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!setAudience || !setSort) return; // guard, teoride her zaman var

    // LocalStorage güncelle
    writeJSON(LS_AUDIENCE, audience);
    writeJSON(LS_AUDIENCE_LEGACY, audience);
    writeJSON(LS_SORT_NEW, sort);
    writeJSON(LS_SORT, sort);
    writeJSON(LS_GROUP, group);
    writeJSON(LS_QUERY, searchText || "");
    writeJSON(LS_SELECTED, selectedRouteId || null);

    const hasText = !!(searchText && searchText.trim());
    const modeParam = hasText ? "search" : "near";

    const audParam =
      audience === DEFAULT_AUDIENCE
        ? null
        : audience === "following"
        ? "following"
        : "all";

    // likes → votes, search modunda near → new
    let sortParam;
    if (modeParam === "search" && sort === "near") {
      sortParam = "new";
    } else if (sort === "near") {
      sortParam = "near";
    } else if (sort === "likes") {
      sortParam = "votes";
    } else if (sort === "rating") {
      sortParam = "rating";
    } else {
      sortParam = "new";
    }

    const groupParam = group === DEFAULT_GROUP ? null : group;
    const cityParam = filters.city ? filters.city : null;
    const countryParam = filters.country ? filters.country : null;
    const tagsParam =
      filters.tags && filters.tags.length ? filters.tags.join(",") : null;

    const qParam = hasText ? searchText.trim() : null;
    const selParam =
      selectedRouteId && String(selectedRouteId).trim().length
        ? String(selectedRouteId).trim()
        : null;

    pushParams({
      m: modeParam,
      a: audParam,
      s: sortParam,
      groupBy: groupParam,
      city: cityParam,
      country: countryParam,
      tags: tagsParam,
      q: qParam,
      sel: selParam,
    });
  }, [audience, sort, group, filters, searchText, selectedRouteId]);

  // popstate → URL'den geri yükle (m/a/s/q/sel + groupBy/city/country/tags)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!setAudience || !setSort) return;

    const handler = () => {
      const audRaw = readParam("a", null) ?? readParam("aud", null);
      let aud = normalizeAudience(audRaw);

      const srtRaw = readParam("s", null) ?? readParam("sort", null);
      let srt = normalizeSort(srtRaw);

      const grp = normalizeGroup(
        readParam("groupBy", null) ?? readParam("group", null)
      );

      const city = (readParam("city", "") || "").toString();
      const country = (readParam("country", "") || "").toString();
      const tagsRaw = readParam("tags", null);
      const qVal = (readParam("q", "") || "").toString();
      const modeRaw = readParam("m", null);
      const selRaw = readParam("sel", null);

      let tags = [];
      if (typeof tagsRaw === "string" && tagsRaw.trim()) {
        tags = tagsRaw
          .split(/[,\s]+/g)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10);
      }

      const modeFromUrl =
        (modeRaw || "").toString().toLowerCase() === "search"
          ? "search"
          : "near";

      const isSearchLike =
        modeFromUrl === "search" ||
        (qVal && qVal.toString().trim().length > 0);

      if (!aud) aud = DEFAULT_AUDIENCE;
      if (!srt) {
        srt = isSearchLike ? "new" : DEFAULT_SORT;
      }

      setAudience(aud);
      setSort(srt);
      setGroup(grp);
      setFilters((prev) => ({
        ...prev,
        city,
        country,
        tags,
      }));
      setSearchText(qVal);

      const sel =
        typeof selRaw === "string" && selRaw.trim() ? selRaw.trim() : null;
      setSelectedRouteId(sel);
    };

    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
    };
  }, [
    setAudience,
    setSort,
    setGroup,
    setFilters,
    setSearchText,
    setSelectedRouteId,
  ]);
}
