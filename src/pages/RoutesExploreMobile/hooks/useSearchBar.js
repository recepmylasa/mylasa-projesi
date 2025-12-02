// src/pages/RoutesExploreMobile/hooks/useSearchBar.js

import { useCallback, useEffect, useRef, useState } from "react";

const LS_RECENT_Q = "r_recentq";
const DEBOUNCE_MS = 300;

// localStorage'dan son aramaları oku
function loadRecentQueries() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_RECENT_Q);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .slice(0, 10);
  } catch {
    return [];
  }
}

// localStorage'a son aramaları yaz
function saveRecentQueries(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_RECENT_Q, JSON.stringify(list));
  } catch {
    // sessiz geç
  }
}

export default function useSearchBar() {
  const [searchText, setSearchText] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentQueries, setRecentQueries] = useState(() =>
    loadRecentQueries()
  );

  const debounceTimerRef = useRef(null);
  const blurTimerRef = useRef(null);

  const hasSearch = debouncedQuery.trim().length > 0;

  // Son aramalar listesine yeni kayıt ekle
  const bumpRecentQuery = useCallback((valueRaw) => {
    const value = (valueRaw || "").trim();
    if (!value) return;

    setRecentQueries((prev) => {
      const without = prev.filter((q) => q.toLowerCase() !== value.toLowerCase());
      const next = [value, ...without].slice(0, 10);
      saveRecentQueries(next);
      return next;
    });
  }, []);

  // Son aramaları tamamen temizle
  const clearRecentQueries = useCallback(() => {
    setRecentQueries([]);
    saveRecentQueries([]);
  }, []);

  // Arama kutusunu temizle
  const clearSearch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setSearchText("");
    setDebouncedQuery("");
  }, []);

  // ENTER / ESC davranışları
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        // anında arama tetikle
        const value = (searchText || "").trim();
        setDebouncedQuery(value);
        bumpRecentQuery(value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        clearSearch();
      }
    },
    [searchText, bumpRecentQuery, clearSearch]
  );

  const handleFocus = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setIsSearchFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    // Son aramalar listesine tıklanabilsin diye ufak gecikme
    blurTimerRef.current = setTimeout(() => {
      setIsSearchFocused(false);
    }, 120);
  }, []);

  const handleRecentClick = useCallback(
    (value) => {
      const q = (value || "").trim();
      if (!q) return;

      setSearchText(q);
      setDebouncedQuery(q);
      bumpRecentQuery(q);
    },
    [bumpRecentQuery]
  );

  const handleRecentClear = useCallback(
    (event) => {
      if (event) event.preventDefault();
      clearRecentQueries();
    },
    [clearRecentQueries]
  );

  // Dışarıdan çağrılabilen "hemen ara" fonksiyonu
  const triggerImmediateSearch = useCallback(
    (valueMaybe) => {
      const value =
        typeof valueMaybe === "string" ? valueMaybe.trim() : searchText.trim();

      setSearchText(value);
      setDebouncedQuery(value);
      bumpRecentQuery(value);
    },
    [searchText, bumpRecentQuery]
  );

  // 300ms debounce
  useEffect(() => {
    if (!searchText) {
      if (debouncedQuery) {
        setDebouncedQuery("");
      }
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const timer = setTimeout(() => {
      const q = searchText.trim();
      setDebouncedQuery(q);
      if (q) {
        bumpRecentQuery(q);
      }
    }, DEBOUNCE_MS);

    debounceTimerRef.current = timer;

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [searchText, debouncedQuery, bumpRecentQuery]);

  // Unmount temizliği
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  return {
    searchText,
    setSearchText,
    debouncedQuery,
    hasSearch,
    loadingSearch,
    setLoadingSearch, // gerekiyorsa diğer hook'lar buradan değiştirebilsin
    isSearchFocused,
    recentQueries,
    handlers: {
      onFocus: handleFocus,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      onRecentClick: handleRecentClick,
      onRecentClear: handleRecentClear,
      clearSearch,
      triggerImmediateSearch,
    },
  };
}
