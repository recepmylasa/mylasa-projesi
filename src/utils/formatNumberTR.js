// src/utils/formatNumberTR.js
// TR kompakt sayı yazımı: 23,1 B / 6,3 Mn / 1,2 Mr
export default function formatNumberTR(n) {
  const num = Number(n ?? 0);
  const fmt = (v) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  if (num >= 1_000_000_000) return `${fmt(num/1_000_000_000)} Mr`;
  if (num >= 1_000_000)     return `${fmt(num/1_000_000)} Mn`;
  if (num >= 1_000)         return `${fmt(num/1_000)} B`;
  return fmt(num);
}
