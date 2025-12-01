// src/pages/RoutesExploreMobile/utils/grouping.js

import { getRouteCity, getRouteCountryLabel } from "./routeFormatters";

export function mapSortToOrder(sort) {
  if (sort === "rating") return "top";
  if (sort === "likes") return "trending";
  return "new";
}

export function makeGroups(items, group) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  if (!group || group === "none") {
    return [
      {
        key: "all",
        label: "",
        items,
      },
    ];
  }

  const buckets = new Map();

  for (const item of items) {
    let key = "";
    if (group === "city") {
      key = getRouteCity(item);
    } else if (group === "country") {
      key = getRouteCountryLabel(item);
    }

    const finalKey = (key && String(key).trim()) || "Diğer";
    if (!buckets.has(finalKey)) buckets.set(finalKey, []);
    buckets.get(finalKey).push(item);
  }

  const groups = Array.from(buckets.entries()).map(([key, list]) => ({
    key,
    label: key,
    items: list,
  }));

  groups.sort((a, b) => {
    const la = (a.label || "").toLocaleLowerCase("tr-TR");
    const lb = (b.label || "").toLocaleLowerCase("tr-TR");
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });

  return groups;
}
