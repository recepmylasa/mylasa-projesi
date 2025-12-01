// src/pages/RoutesExploreMobile/utils/sortMap.js
// ADIM 32: Liste sorguları için sıralama → backend order map’i

/**
 * UI'daki sort değerini backend'deki "order" paramına çevirir.
 *
 * sort:
 * - "new"     → "new"       (En yeni)
 * - "rating"  → "top"       (En yüksek puan)
 * - "likes"   → "trending"  (En çok oy)
 * - "near"    → "new"       (Yakınımda için fallback)
 */
export function mapSortToOrder(sort) {
  if (sort === "new") return "new";
  if (sort === "rating") return "top"; // en yüksek puan
  if (sort === "likes") return "trending"; // en çok oy
  return "new";
}
