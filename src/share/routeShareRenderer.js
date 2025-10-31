// Canvas tabanlı rota paylaşım görseli üretimi (Story/Kare).
// Harici harita karo/Static Maps YOK. route.path (lat,lng) ve stops kullanılır.

const DPR = typeof window !== "undefined" ? Math.max(1, Math.min(3, window.devicePixelRatio || 1)) : 1;

const SIZES = {
  story:  { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

const COLORS = {
  bg: "#ffffff",
  ink: "#111111",
  sub: "#555555",
  line: "#1a73e8",
  halo: "rgba(255,255,255,1)",
  stop: "#111111",
  start: "#0b8043",
  end: "#ea4335",
  watermark: "#7a7a7a",
};

function ensureNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function takeTitle(route) {
  return (
    route?.title ||
    route?.name ||
    route?.routeTitle ||
    "İsimsiz Rota"
  );
}

function takeOwnerName(route) {
  return (
    route?.ownerUsername ||
    route?.ownerName ||
    route?.authorUsername ||
    route?.authorName ||
    route?.owner?.kullaniciAdi ||
    route?.owner?.name ||
    route?.ownerId ||
    "Kullanıcı"
  );
}

function takeOwnerAvatar(route) {
  return (
    route?.ownerAvatar ||
    route?.ownerPhoto ||
    route?.authorPhoto ||
    route?.owner?.profilFoto ||
    route?.owner?.photoURL ||
    route?.owner?.avatar ||
    route?.authorAvatar ||
    null
  );
}

function kmFromMeters(m) {
  const km = ensureNumber(m, 0) / 1000;
  return Math.round(km * 10) / 10; // 1 ondalık
}

function minsFromMs(ms) {
  const mins = ensureNumber(ms, 0) / 60000;
  return Math.round(mins);
}

function ratingLine(route) {
  const avg = route?.ratingAvg ?? route?.rating_average ?? route?.rating?.avg;
  const cnt = route?.ratingCount ?? route?.rating_count ?? route?.rating?.count;
  if (!avg || !cnt) return "Henüz oy yok";
  const avgStr = (Math.round(avg * 10) / 10).toFixed(1);
  return `★ ${avgStr} • ${cnt}`;
}

function areasLine(route) {
  const city = route?.areas?.city;
  const cc   = route?.areas?.countryCode;
  if (city && cc) return `${city} • ${cc}`;
  if (city) return city;
  if (cc) return cc;
  return "";
}

function computeBounds(points) {
  let minLat =  90, maxLat = -90, minLng =  180, maxLng = -180;
  let any = false;
  for (const p of points) {
    const lat = ensureNumber(p.lat ?? p.latitude);
    const lng = ensureNumber(p.lng ?? p.longitude ?? p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    any = true;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  if (!any) return null;
  // BBox en/boy oranını biraz şişir (çok ince çizgilerde kenara yapışmasın)
  const latPad = (maxLat - minLat) * 0.08 || 0.01;
  const lngPad = (maxLng - minLng) * 0.08 || 0.01;
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

function projectFactory(bbox, rect) {
  const latSpan = bbox.maxLat - bbox.minLat;
  const lngSpan = bbox.maxLng - bbox.minLng;

  const sx = rect.w / (lngSpan || 1e-6);
  const sy = rect.h / (latSpan || 1e-6);
  const s  = Math.min(sx, sy); // içe sığdır

  const extraX = (rect.w - (lngSpan * s)) / 2;
  const extraY = (rect.h - (latSpan * s)) / 2;

  return (ll) => {
    const lat = ensureNumber(ll.lat ?? ll.latitude);
    const lng = ensureNumber(ll.lng ?? ll.longitude ?? ll.lon);
    const x = rect.x + extraX + (lng - bbox.minLng) * s;
    const y = rect.y + extraY + (bbox.maxLat - lat) * s; // lat ↑ yukarı
    return { x, y };
  };
}

// Ramer–Douglas–Peucker (2D) — epsilon px
function simplifyRDP(pts, epsilon) {
  if (!pts || pts.length < 3) return pts || [];
  const dmax = (() => {
    let idx = 0;
    let max = 0;
    const start = pts[0], end = pts[pts.length - 1];
    const denom = Math.hypot(end.x - start.x, end.y - start.y) || 1e-6;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      // noktanın doğruya mesafesi
      const num = Math.abs((end.y - start.y) * p.x - (end.x - start.x) * p.y + end.x * start.y - end.y * start.x);
      const d = num / denom;
      if (d > max) { idx = i; max = d; }
    }
    return { idx, max };
  })();

  if (dmax.max > epsilon) {
    const left  = simplifyRDP(pts.slice(0, dmax.idx + 1), epsilon);
    const right = simplifyRDP(pts.slice(dmax.idx), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [pts[0], pts[pts.length - 1]];
  }
}

function drawRoundedImage(ctx, img, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function fitTextEllipsis(ctx, text, maxWidth) {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  const ell = "…";
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const s = text.slice(0, mid) + ell;
    if (ctx.measureText(s).width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(0, hi - 1)) + ell;
}

async function loadImageSafe(src) {
  if (!src) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    const p = new Promise((res, rej) => {
      img.onload = () => res(img);
      img.onerror = rej;
    });
    img.src = src;
    return await p;
  } catch {
    return null;
  }
}

async function loadLogo() {
  // public/ altından erişilir
  try {
    return await loadImageSafe("/mylasa-logo.png");
  } catch { return null; }
}

function currentOrigin() {
  try { return window?.location?.origin || ""; } catch { return ""; }
}

function buildPermalink(routeId) {
  const origin = currentOrigin();
  if (!routeId) return origin || "mylasa.app";
  return `${origin}/r/${encodeURIComponent(routeId)}`;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function buildMapRect(W, H) {
  // Üst bilgi ve alt user bloklarına yer bırak
  const pad = 32;
  const topBar = 180;     // başlık + meta alanı
  const bottomBar = 150;  // avatar + watermark
  return {
    x: pad,
    y: topBar,
    w: W - pad * 2,
    h: H - topBar - bottomBar,
  };
}

function drawPolyline(ctx, pts, haloPx, linePx) {
  if (!pts || pts.length < 2) return;
  // Halo
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = COLORS.halo;
  ctx.lineWidth = haloPx;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  // Ana çizgi
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = linePx;
  ctx.stroke();
  ctx.restore();
}

function drawPinsAndStops(ctx, projectedPath, projectedStops, dpr) {
  // Başlangıç & bitiş
  if (projectedPath && projectedPath.length >= 2) {
    const start = projectedPath[0];
    const end   = projectedPath[projectedPath.length - 1];
    // Start (yeşil)
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = COLORS.start;
    ctx.arc(start.x, start.y, 6 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.halo;
    ctx.lineWidth = 3 * dpr;
    ctx.stroke();
    ctx.restore();

    // End (kırmızı)
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = COLORS.end;
    ctx.arc(end.x, end.y, 6 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.halo;
    ctx.lineWidth = 3 * dpr;
    ctx.stroke();
    ctx.restore();
  }

  // Stops (siyah noktalar)
  if (projectedStops && projectedStops.length) {
    for (const s of projectedStops) {
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = COLORS.stop;
      ctx.arc(s.x, s.y, 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      // beyaz ince halka
      ctx.strokeStyle = COLORS.halo;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
      ctx.restore();
    }
  }
}

function textStyles(ctx, dpr) {
  ctx.textBaseline = "alphabetic";
  return {
    setTitle:   () => (ctx.font = `${Math.round(36 * dpr)}px ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial`),
    setMeta:    () => (ctx.font = `${Math.round(24 * dpr)}px ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial`),
    setWater:   () => (ctx.font = `${Math.round(18 * dpr)}px ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial`),
    setAuthor:  () => (ctx.font = `${Math.round(26 * dpr)}px ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial`),
  };
}

/**
 * renderRouteShare
 * @param {Object} opts
 * @param {Object} opts.route - rota dokümanı
 * @param {Array}  opts.stops - {lat,lng} veya {location:{lat,lng}} listesi
 * @param {"story"|"square"} opts.size
 * @param {Object} [opts.theme]
 * @returns {Promise<{blob:Blob,width:number,height:number}>}
 */
export async function renderRouteShare({ route = {}, stops = [], size = "story", theme = {} }) {
  const { w, h } = SIZES[size] || SIZES.story;
  const W = Math.round(w * DPR);
  const H = Math.round(h * DPR);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Arkaplan
  ctx.fillStyle = theme.bg || COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Üst bilgi
  const title  = takeTitle(route);
  const meta1  = areasLine(route);
  const km     = kmFromMeters(route?.totalDistanceM ?? route?.distanceM ?? route?.distance_m);
  const mins   = minsFromMs(route?.durationMs ?? route?.duration_ms ?? route?.duration);
  const meta2  = `${km || 0} km • ${mins || 0} dk`;
  const meta3  = ratingLine(route);

  const styles = textStyles(ctx, DPR);

  // Logo
  const logo = await loadLogo();

  // Harita dikdörtgeni
  const mapRect = buildMapRect(W, H);

  // Noktaları topla
  const path = Array.isArray(route?.path) ? route.path : [];
  const pathLL = path.map(p => ({
    lat: p.lat ?? p.latitude,
    lng: p.lng ?? p.longitude ?? p.lon
  })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  const stopsLL = (stops || []).map(s => {
    const ll = s?.location || s;
    return { lat: ll?.lat ?? ll?.latitude, lng: ll?.lng ?? ll?.longitude ?? ll?.lon };
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  const allForBounds = pathLL.length ? pathLL : stopsLL;

  let projectedPath = null;
  let projectedStops = null;

  const bbox = computeBounds(allForBounds);
  if (bbox) {
    const project = projectFactory(bbox, mapRect);
    if (pathLL.length) {
      const pxPts = pathLL.map(project);
      // px cinsinden sadeleştirme
      const simplified = simplifyRDP(pxPts, 2.0 * DPR);
      projectedPath = simplified;
    }
    if (stopsLL.length) {
      projectedStops = stopsLL.map(project);
    }
  }

  // Haritayı çiz
  if (projectedPath || projectedStops) {
    const haloPx = 6 * DPR;
    const linePx = 4 * DPR;
    if (projectedPath && projectedPath.length >= 2) {
      drawPolyline(ctx, projectedPath, haloPx, linePx);
    }
    drawPinsAndStops(ctx, projectedPath, projectedStops, DPR);
  } else {
    // Fallback — harita verisi yok
    ctx.save();
    ctx.fillStyle = "#f5f6f7";
    ctx.fillRect(mapRect.x, mapRect.y, mapRect.w, mapRect.h);
    ctx.restore();

    styles.setMeta();
    ctx.fillStyle = COLORS.sub;
    const msg = "Harita verisi yok";
    const tw = ctx.measureText(msg).width;
    ctx.fillText(msg, mapRect.x + (mapRect.w - tw) / 2, mapRect.y + mapRect.h / 2);
  }

  // ÜST: Logo + başlık + areas + km/süre + rating
  const pad = 24 * DPR;
  const colX = pad + (logo ? 48 * DPR + 12 * DPR : 0);
  const maxTitleW = W - colX - pad;

  if (logo) {
    const L = 48 * DPR;
    ctx.drawImage(logo, pad, pad, L, L);
  }

  styles.setTitle();
  ctx.fillStyle = COLORS.ink;
  const titleStr = fitTextEllipsis(ctx, String(title || ""), maxTitleW);
  ctx.fillText(titleStr, colX, pad + 38 * DPR);

  styles.setMeta();
  ctx.fillStyle = COLORS.sub;
  let ty = pad + 38 * DPR + 28 * DPR;
  if (meta1) {
    const m1 = fitTextEllipsis(ctx, meta1, maxTitleW);
    ctx.fillText(m1, colX, ty);
    ty += 26 * DPR;
  }
  ctx.fillText(meta2, colX, ty); ty += 26 * DPR;
  ctx.fillText(meta3, colX, ty);

  // ALT: avatar + kullanıcı adı + watermark + permalink
  const avatarSrc = takeOwnerAvatar(route);
  const avatarImg = await loadImageSafe(avatarSrc);
  const AV = 44 * DPR;
  const ax = pad + AV / 2;
  const ay = H - pad - AV / 2 - 8 * DPR;

  if (avatarImg) {
    // beyaz halka
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, AV / 2 + 3 * DPR, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.bg;
    ctx.fill();
    ctx.restore();

    drawRoundedImage(ctx, avatarImg, ax, ay, AV / 2);
  }

  styles.setAuthor();
  ctx.fillStyle = COLORS.ink;
  const owner = takeOwnerName(route);
  const ownerX = pad + AV + 12 * DPR;
  const ownerMax = clamp(W * 0.5, 240 * DPR, W - ownerX - 24 * DPR);
  const ownerStr = fitTextEllipsis(ctx, owner, ownerMax);
  ctx.fillText(ownerStr, ownerX, ay + 10 * DPR);

  styles.setWater();
  ctx.fillStyle = COLORS.watermark;
  const watermark = "mylasa.app";
  const wmTw = ctx.measureText(watermark).width;
  ctx.fillText(watermark, W - pad - wmTw, H - pad - 8 * DPR);

  // küçük permalink (çok küçük, log gibi)
  const link = buildPermalink(route?.id);
  const linkTw = ctx.measureText(link).width;
  ctx.fillText(link, W - pad - linkTw, H - pad - 34 * DPR);

  // PNG BLOB
  const blob = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 0.92));
  return { blob, width: w, height: h };
}
