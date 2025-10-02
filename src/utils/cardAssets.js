// src/utils/cardAssets.js
// Kart görsel yolunu (jpg/png) güvenle çözen yardımcı.
// Amaç: Firestore'da .jpg dursa bile public'te .png varsa onu otomatik bulup döndürmek.
// Kullanım: const url = await safeResolve(drop.asset);

const CACHE = new Map();

// İsteğe bağlı placeholderlar (varsa kullanır, yoksa ilk bulunan adayı döndürür)
const PLACEHOLDERS = ["/cards/_SILHOUETTE.jpg", "/cards/_SILHOUETTE.png"];

/** Bir URL gerçekten yüklenebiliyor mu, hızlı görüntü yoklaması */
function probeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    // İlk yoklamada cache takılmasın diye küçük bir sorgu eki
    img.src = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  });
}

/** Verilen asset için denenebilecek tüm aday yolları üretir */
export function buildCandidates(asset) {
  if (!asset || typeof asset !== "string") return [...PLACEHOLDERS];

  let a = asset.trim();

  // Yanlış çift uzantıları düzelt (.jpg.png / .png.jpg)
  a = a.replace(/\.jpg\.png$/i, ".png").replace(/\.png\.jpg$/i, ".jpg");

  // Başında protokol yoksa ve / ile başlamıyorsa root'a sabitle
  if (!/^([a-z]+:|\/)/i.test(a)) a = "/" + a;

  // Mutlak URL ise (http, data, blob, gs) doğrudan aday
  if (/^(https?:|data:|blob:|gs:)/i.test(a)) return [a];

  const m = a.match(/\.(jpg|jpeg|png)$/i);
  const root = m ? a.slice(0, m.index) : a;
  const list = new Set();

  // Orijinal (küçük harf uzantı)
  if (m) list.add(root + m[0].toLowerCase());
  else list.add(a);

  // Uzantı varyasyonları
  [".png", ".jpg", ".jpeg"].forEach((e) => list.add(root + e));
  [".PNG", ".JPG", ".JPEG"].forEach((e) => list.add(root + e));

  // Hic uzantı yoksa
  if (!m) {
    list.add(a + ".png");
    list.add(a + ".jpg");
  }

  return Array.from(list);
}

/** Asenkron ve cache’li çözümleyici */
export async function safeResolve(asset) {
  const key = String(asset || "");
  if (CACHE.has(key)) return CACHE.get(key);

  const candidates = buildCandidates(key);

  for (const url of candidates) {
    // Mutlak http/data/blob ise yoklama yapmadan kabul et
    if (!url.startsWith("/")) {
      CACHE.set(key, url);
      return url;
    }
    // Sadece aynı origin altında görsel yoklaması yap
    /* eslint-disable no-await-in-loop */
    const ok = await probeImage(url);
    if (ok) {
      CACHE.set(key, url);
      return url;
    }
  }

  // Placeholder denemesi (varsa)
  for (const ph of PLACEHOLDERS) {
    const ok = await probeImage(ph);
    if (ok) {
      CACHE.set(key, ph);
      return ph;
    }
  }

  // Son çare: ilk adayı döndür (404 olursa <img onError> zaten saklayabilir)
  const fallback = candidates[0];
  CACHE.set(key, fallback);
  return fallback;
}

/** Test veya debug için cache temizleyici */
export function resetCardAssetCache() {
  CACHE.clear();
}
