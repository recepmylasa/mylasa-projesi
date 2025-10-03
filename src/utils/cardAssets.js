// src/utils/cardAssets.js
// Her formatı (png/jpg/jpeg/webp/gif/avif) sırayla dener.
// Bulamazsa gömülü base64 placeholder döndürür (beyaz ekran yok!).

const CACHE = new Map();
const CANDIDATE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"];

// 600x1066 gri placeholder (SVG → data URL)
const FALLBACK_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='1066' viewBox='0 0 600 1066'>
      <defs>
        <linearGradient id='g' x1='0' x2='1'>
          <stop offset='0' stop-color='#f3f3f3'/>
          <stop offset='1' stop-color='#e9e9e9'/>
        </linearGradient>
      </defs>
      <rect fill='url(#g)' width='100%' height='100%'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
            fill='#999' font-family='Arial,Helvetica,sans-serif' font-size='32'>image</text>
    </svg>`
  );

function normPath(input) {
  if (!input) return "";
  const s = String(input).replace(/^public\//, "");
  return s.startsWith("/") ? s : `/${s}`;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function tryLoad(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(null);
    const sep = url.includes("?") ? "&" : "?";
    img.src = `${url}${sep}v=${Date.now()}`; // dev cache kır
  });
}

export async function safeResolve(asset) {
  if (!asset) return FALLBACK_DATA_URL;

  const key = String(asset);
  if (CACHE.has(key)) return CACHE.get(key);

  const base = normPath(asset);
  const publicUrl =
    (typeof process !== "undefined" && process?.env?.PUBLIC_URL) || "";

  const hasExt = /\.[a-z0-9]{2,5}$/i.test(base);
  const candidates = hasExt ? [base] : CANDIDATE_EXTS.map((ext) => `${base}${ext}`);

  const urls = uniq(candidates.flatMap((u) => [u, `${publicUrl}${u}`]));

  for (const u of urls) {
    const ok = await tryLoad(u);
    if (ok) {
      CACHE.set(key, ok);
      return ok;
    }
  }

  CACHE.set(key, FALLBACK_DATA_URL);
  return FALLBACK_DATA_URL;
}
