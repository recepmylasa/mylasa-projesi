// Basit puan / sayı yardımcıları

/**
 * route.ratingAvg varsa onu kullanır,
 * yoksa ratingSum / ratingCount hesaplar, yoksa 0 döner.
 */
export function getRatingAvg(route) {
  if (!route) return 0;
  const direct = route.ratingAvg;
  if (typeof direct === "number" && !Number.isNaN(direct)) {
    return direct;
  }

  const sum = Number(route.ratingSum || 0);
  const count = Number(route.ratingCount || 0);
  if (count > 0 && Number.isFinite(sum)) {
    return sum / count;
  }
  return 0;
}

/**
 * Sayıları karşılaştırmak için yardımcı.
 * dir === "asc"  → küçükten büyüğe
 * dir === "desc" → büyükten küçüğe
 */
export function cmpNumber(a, b, dir = "asc") {
  const av = Number(a);
  const bv = Number(b);

  const aValid = Number.isFinite(av);
  const bValid = Number.isFinite(bv);

  if (!aValid && !bValid) return 0;
  if (!aValid) return dir === "asc" ? 1 : -1;
  if (!bValid) return dir === "asc" ? -1 : 1;

  if (av === bv) return 0;
  return dir === "asc" ? av - bv : bv - av;
}
