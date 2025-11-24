// src/utils/formatters.js
// Genel metin normalize + Keşfet gruplama anahtarları

export function normText(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Şehir bazlı grup anahtarı
 * city → admin1 → "Bilinmeyen"
 */
export function fmtGroupKeyCity(areas = {}) {
  const rawCity = normText(areas.city || areas.admin1 || "");
  const label = rawCity || "Bilinmeyen";
  const key = label.toLocaleLowerCase("tr-TR");
  return { key, label };
}

/**
 * Ülke bazlı grup anahtarı
 * country → countryName → countryCode/cc → "Bilinmeyen"
 * countryCode varsa büyük harfli rozet için döndürür.
 */
export function fmtGroupKeyCountry(areas = {}) {
  const rawCountry = normText(areas.country || areas.countryName || "");
  const rawCode = normText(areas.countryCode || areas.cc || "");

  const hasCountry = !!rawCountry;
  const hasCode = !!rawCode;

  let label;
  if (hasCountry) {
    label = rawCountry;
  } else if (hasCode) {
    label = rawCode.toUpperCase();
  } else {
    label = "Bilinmeyen";
  }

  const key = label.toLocaleLowerCase("tr-TR");
  const cc = hasCode ? rawCode.toUpperCase() : null;

  return { key, label, cc };
}
