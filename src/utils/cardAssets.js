// src/utils/cardAssets.js
// Kart görsellerini güvenle çözüp önceden belleğe alır.

const normalize = (p) => {
  if (!p) return "";
  // Firestore'a bazen S1/LOVE.png, bazen /cards/S1/LOVE.png gelebiliyor.
  let path = p.trim();
  if (!/^https?:\/\//i.test(path)) {
    if (!path.startsWith("/")) path = "/" + path;
    if (!path.startsWith("/cards/")) path = "/cards" + (path.startsWith("/cards") ? "" : path);
  }
  return path;
};

// Basit preload: <img> aç/kapa
export const preload = (url) => {
  if (!url) return;
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
};

export const safeResolve = async (raw) => {
  // Ağ isteği yapmadan olası uzantı varyantlarını deneriz;
  // burada “basit strateji”: png öncelik, sonra jpg.
  let base = normalize(raw);
  if (!base) return "";

  // Eğer png ise direkt dön; mevcut projede kartlar png.
  if (/\.png(\?.*)?$/i.test(base)) return base;

  // jpg geldiyse png'i dene (kartların çoğu png)
  if (/\.jpe?g(\?.*)?$/i.test(base)) {
    const png = base.replace(/\.jpe?g(\?.*)?$/i, ".png");
    return png;
  }

  // Uzantı yoksa png varsay.
  if (!/\.(png|jpe?g)(\?.*)?$/i.test(base)) return base + ".png";

  return base;
};
