// src/pages/RoutesExploreMobile/utils/grouping.js
// ADIM 32: Şehir / ülke bazlı gruplama

import {
  getRouteCity,
  getRouteCountryLabel,
} from "./routeFormatters";

/**
 * Rota listesini gruplar:
 * - "none"    → tek grup, başlıksız
 * - "city"    → şehir bazlı gruplar
 * - "country" → ülke bazlı gruplar
 *
 * Çıktı:
 * [
 *   { key: string, label: string, items: Route[] },
 *   ...
 * ]
 */
export function makeGroups(items, group) {
  const list = Array.isArray(items) ? items : [];

  if (group === "none") {
    return [
      {
        key: "all",
        label: "",
        items: list,
      },
    ];
  }

  const map = new Map();

  list.forEach((r) => {
    let key = "other";
    let label = "Diğer";

    if (group === "city") {
      const city = getRouteCity(r);
      if (city) {
        key = `city:${city.toLowerCase()}`;
        label = city;
      }
    } else if (group === "country") {
      const country = getRouteCountryLabel(r);
      if (country) {
        key = `country:${country.toLowerCase()}`;
        label = country;
      }
    }

    const existing = map.get(key);
    if (existing) {
      existing.items.push(r);
    } else {
      map.set(key, { key, label, items: [r] });
    }
  });

  const out = Array.from(map.values());
  out.sort((a, b) => {
    const la = (a.label || "").toLowerCase();
    const lb = (b.label || "").toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
  return out;
}
