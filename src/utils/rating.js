// src/utils/rating.js
// Puan ve mesafe yardımcıları

/**
 * route.ratingAvg varsa onu kullanır,
 * yoksa ratingSum / ratingCount hesaplar; aksi halde 0 döner.
 */
export function getRatingAvg(route) {
  if (!route) return 0;
  const direct = route.ratingAvg;
  if (typeof direct === "number" && !Number.isNaN(direct)) {
    return direct;
  }

  const sum = Number(route?.ratingSum ?? 0);
  const count = Number(route?.ratingCount ?? 0);
  if (count > 0 && Number.isFinite(sum)) {
    return sum / count;
  }
  return 0;
}

/**
 * Sayısal karşılaştırma yardımcı fonksiyonu.
 * null/undefined/NaN daima EN SONA atılır.
 *
 * dir === "asc"  → küçükten büyüğe
 * dir === "desc" → büyükten küçüğe
 */
export function cmp(a, b, dir = "asc") {
  const av = Number(a);
  const bv = Number(b);

  const aValid = Number.isFinite(av);
  const bValid = Number.isFinite(bv);

  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;

  if (av === bv) return 0;
  return dir === "desc" ? bv - av : av - bv;
}

/**
 * Mesafe formatı: metre → "850 m" veya "12.3 km"
 * m < 1000 ise en yakın tam metre; aksi halde 1 ondalık km.
 */
export function km(meters) {
  const m = Number(meters);
  if (!Number.isFinite(m) || m <= 0) return "";
  if (m < 1000) {
    return `${Math.round(m)} m`;
  }
  const k = m / 1000;
  return `${k.toFixed(1)} km`;
}
