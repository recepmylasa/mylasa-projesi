// src/pages/RoutesExploreMobile/utils/routeFormatters.js

export function getCreatedAtSec(route) {
  if (!route) return 0;

  const createdAt =
    route.createdAt ??
    route.created_at ??
    route.createdAtSec ??
    route._createdAtSec;

  if (!createdAt) return 0;

  // Firestore Timestamp
  if (typeof createdAt === "object") {
    if (typeof createdAt.seconds === "number") {
      return createdAt.seconds;
    }
    if (typeof createdAt.toMillis === "function") {
      return Math.floor(createdAt.toMillis() / 1000);
    }
  }

  // JS Date
  if (createdAt instanceof Date) {
    return Math.floor(createdAt.getTime() / 1000);
  }

  // Numeric (sec or ms)
  const num = Number(createdAt);
  if (Number.isFinite(num)) {
    // Heuristic: looks like ms?
    return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
  }

  // ISO/string
  const parsed = Date.parse(String(createdAt));
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

export function getRouteCity(route) {
  if (!route) return "";
  // Öncelik: mevcut model (areas.city). Geriye dönük: diğer alanlar.
  const a = route.areas || {};
  const city =
    a.city ??
    route.city ??
    (route.location && (route.location.city || route.location.town || route.location.district)) ??
    (route.place && route.place.city) ??
    "";
  return typeof city === "string" ? city.trim() : "";
}

export function getRouteCountryLabel(route) {
  if (!route) return "";
  const a = route.areas || {};
  // Önce anlamlı ülke adı → sonra kodlar
  let label =
    a.countryName ??
    a.country ??
    a.countryCode ??
    a.cc ??
    route.country ??
    (route.location && (route.location.country || route.location.countryCode)) ??
    (route.place && (route.place.country || route.place.countryCode)) ??
    "";

  if (typeof label !== "string") label = String(label || "");

  const up = label.trim().toUpperCase();

  // TR özel
  if (up === "TR" || up === "TUR" || up === "TURKEY" || up === "TÜRKİYE") {
    return "Türkiye";
  }

  // Eğer sadece kod geldiyse (2–3 harf) koda dokunma; isim geldiyse olduğu gibi göster.
  if (/^[A-Z]{2,3}$/.test(up)) return up;
  return label.trim();
}

// Haversine — geçersiz girişte Infinity döndür (sıralama/persist güvenli)
export function distanceMeters(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);

  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return Infinity;
  }

  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);

  const h =
    s1 * s1 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const d = R * c;

  return Number.isFinite(d) ? d : Infinity;
}
