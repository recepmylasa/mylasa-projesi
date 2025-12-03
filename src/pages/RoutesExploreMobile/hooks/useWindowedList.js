// src/pages/RoutesExploreMobile/hooks/useWindowedList.js
// EMİR 12 – Hafif sanallaştırma (windowing) için küçük yardımcı hook.
// Scroll konteyneri (genelde liste alanı) ve toplam öğe sayısını bilir,
// yaklaşık kart yüksekliğine göre görünür aralığı + overscan hesaplar.

import { useEffect, useState } from "react";

export default function useWindowedList({
  containerRef,
  itemCount,
  estimatedItemHeight = 96, // RouteCardMobile yaklaşık yüksekliği
  overscan = 6,
  disabled = false,
}) {
  const [range, setRange] = useState(() => ({
    start: 0,
    end: itemCount,
  }));

  // itemCount değişince temel aralığı güncelle
  useEffect(() => {
    if (disabled) {
      setRange({ start: 0, end: itemCount });
      return;
    }
    setRange((prev) => {
      if (prev.end > itemCount) {
        return { start: 0, end: itemCount };
      }
      return prev;
    });
  }, [itemCount, disabled]);

  useEffect(() => {
    if (disabled) {
      setRange({ start: 0, end: itemCount });
      return;
    }

    if (typeof window === "undefined") {
      setRange({ start: 0, end: itemCount });
      return;
    }

    const el = containerRef?.current;
    if (!el || !itemCount) {
      setRange({ start: 0, end: itemCount });
      return;
    }

    const calcRange = () => {
      if (!el || !itemCount) {
        setRange({ start: 0, end: itemCount });
        return;
      }

      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 0;

      // Konteyner tamamen görünüm dışındaysa, küçük bir pencere bırak
      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        const end = Math.min(
          itemCount,
          overscan * 2 || itemCount
        );
        setRange((prev) =>
          prev.start === 0 && prev.end === end
            ? prev
            : { start: 0, end }
        );
        return;
      }

      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, viewportHeight);
      const visibleHeight = Math.max(visibleBottom - visibleTop, 0);

      // Konteynerin üstünden itibaren ne kadar yukarısı kaydı?
      const scrolledInside = Math.max(0, -rect.top);
      const firstVisibleIndex = Math.max(
        0,
        Math.floor(scrolledInside / estimatedItemHeight)
      );
      const visibleCount = Math.max(
        1,
        Math.ceil(visibleHeight / estimatedItemHeight)
      );

      const start = Math.max(firstVisibleIndex - overscan, 0);
      const end = Math.min(
        itemCount,
        firstVisibleIndex + visibleCount + overscan
      );

      setRange((prev) =>
        prev.start === start && prev.end === end
          ? prev
          : { start, end }
      );
    };

    calcRange();

    const handleScroll = () => {
      calcRange();
    };

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        calcRange();
      });
      resizeObserver.observe(el);
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [containerRef, itemCount, overscan, estimatedItemHeight, disabled]);

  return range;
}
