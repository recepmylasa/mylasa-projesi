// src/services/gpx.js
// GPX oluşturma ve indirme yardımcıları

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function iso(t) {
  if (!t && t !== 0) return "";
  try {
    const d = new Date(Number(t));
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  } catch {
    return "";
  }
}
function slugify(s = "") {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 60) || "route";
}

/**
 * buildGpx({ route, stops, path }) → string
 * - route: {title, createdAt?}
 * - stops: [{lat,lng,title,note,t}]
 * - path : [{lat,lng,t}]
 */
export function buildGpx({ route = {}, stops = [], path = [] }) {
  const name = esc(route.title || "Rota");
  const createdAtIso = route.createdAt?.toDate?.()
    ? route.createdAt.toDate().toISOString()
    : route.createdAt
    ? iso(route.createdAt)
    : "";

  const trkpts = (path || [])
    .map((p) => {
      const time = iso(p.t);
      return `<trkpt lat="${p.lat}" lon="${p.lng}">${time ? `<time>${time}</time>` : ""}</trkpt>`;
    })
    .join("");

  const wpts = (stops || [])
    .map((s) => {
      const t = iso(s.t);
      const nm = esc(s.title || "Durak");
      const desc = esc(s.note || "");
      return `<wpt lat="${s.lat}" lon="${s.lng}"><name>${nm}</name>${desc ? `<desc>${desc}</desc>` : ""}${t ? `<time>${t}</time>` : ""}</wpt>`;
    })
    .join("");

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="mylasa" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${name}</name>${createdAtIso ? `\n    <time>${createdAtIso}</time>` : ""}
  </metadata>
  ${wpts}
  <trk>
    <name>${name}</name>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`;
  return gpx;
}

export function downloadGpx(xmlString, filename) {
  try {
    const blob = new Blob([xmlString], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "route.gpx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  } catch {}
}

export function buildGpxFilename(route = {}) {
  const base = slugify(route.title || "rota");
  const d = route.createdAt?.toDate?.()
    ? route.createdAt.toDate()
    : route.createdAt
    ? new Date(route.createdAt)
    : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `route-${base}-${y}${m}${day}.gpx`;
}
