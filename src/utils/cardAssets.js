// src/utils/cardAssets.js
// Kart görsellerini güvenle çözüp önceden belleğe alır.
// LOVE görünmüyordu → grid artık buradaki deterministik eşlemeden besleniyor.

const normalize = (p) => {
  if (!p) return "";
  let path = p.trim();
  if (!/^https?:\/\//i.test(path)) {
    if (!path.startsWith("/")) path = "/" + path;
    if (!path.startsWith("/cards/")) {
      // "S1/LOVE.png" gibi değerleri /cards/S1/LOVE.png yap
      const slice = path.startsWith("/cards") ? path : "/cards" + path;
      path = slice.replace("//", "/");
    }
  }
  return path;
};

// === S1 için gerçek dosya adları (repo ile birebir) ===
const S1_MAP = {
  "S1-LOVE": "/cards/S1/LOVE.png",
  "S1-HAPPINESS": "/cards/S1/HAPPINESS.jpg.png",
  "S1-SERENITY": "/cards/S1/SERENITY.jpg.png",
  "S1-LOYALTY": "/cards/S1/LOYALTY.jpg.png",
  "S1-AURORA": "/cards/S1/AURORA.jpg.png",
  "S1-VOID": "/cards/S1/VOID.jpg.png",
  "S1-HOPE": "/cards/S1/HOPE.png",
};

// Basit preload
export const preload = (url) => {
  if (!url) return;
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
};

// Uzantı normalize (sync)
export const safeResolve = (raw) => {
  let base = normalize(raw);
  if (!base) return "";

  // Dosya adı biliniyorsa olduğu gibi dön
  if (/\.(png|jpe?g|webp)(\?.*)?$/i.test(base)) return base;

  // Uzantı yoksa png varsay
  return base + ".png";
};

// Grid/Modal ortak: nihai kaynak
export const getCardAsset = (code, raw) => {
  if (code && S1_MAP[code]) return S1_MAP[code];
  // Kod eşleşmesi yoksa normalize et + png tercih et
  const n = safeResolve(raw);
  // Eğer JPG verilmişse projede çoğunluk png olduğu için png’e çevir
  if (/\.jpe?g(\?.*)?$/i.test(n)) return n.replace(/\.jpe?g(\?.*)?$/i, ".png");
  return n;
};

// ——— yardımcılar (mevcut projede kullanılanlar) ———
export const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "";
  const date = timestamp?.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff} saniye önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)} dakika önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  if (diff > 604800)
    return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  return `${Math.floor(diff / 86400)} gün önce`;
};

export const formatCount = (n) => {
  if (typeof n !== "number") return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + "M";
  return (n / 1_000_000_000).toFixed(1) + "B";
};

const toMillis = (ts) => {
  if (!ts) return 0;
  if (typeof ts === "number") return ts < 2e12 ? ts * 1000 : ts;
  if (typeof ts === "string") {
    const t = Date.parse(ts);
    return Number.isNaN(t) ? 0 : t;
  }
  if (ts.seconds) return ts.seconds * 1000;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return 0;
};

export const formatDateTR = (ts) => {
  const ms = toMillis(ts);
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
