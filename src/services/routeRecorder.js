// src/services/routeRecorder.js
// Basit rota kaydedici: idle | recording | finishing
// Örnekleme: >= 30 m; Haversine ile mesafe biriktirir; bbox ve süre hesaplar.

const SAMPLE_MIN_M = 30; // 10–30 m arası eşikten 30 m seçildi (MVP)

function toRad(d) { return (d * Math.PI) / 180; }
function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
  const aa = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

const state = {
  status: "idle",              // idle | recording | finishing
  title: "",
  visibility: "public",

  startedAt: 0,
  finishedAt: 0,

  totalDistanceM: 0,
  path: /** @type {{lat:number,lng:number,t:number}[]} */ ([]),
  stops: /** @type {{order:number,lat:number,lng:number,t:number,title:string,note:string}[]} */ ([]),

  bounds: /** @type {{n:number,s:number,e:number,w:number} | null} */ (null),
};

function resetAll() {
  state.status = "idle";
  state.title = "";
  state.visibility = "public";
  state.startedAt = 0;
  state.finishedAt = 0;
  state.totalDistanceM = 0;
  state.path = [];
  state.stops = [];
  state.bounds = null;
}

function extendBounds(lat, lng) {
  if (!state.bounds) {
    state.bounds = { n: lat, s: lat, e: lng, w: lng };
    return;
    }
  state.bounds.n = Math.max(state.bounds.n, lat);
  state.bounds.s = Math.min(state.bounds.s, lat);
  state.bounds.e = Math.max(state.bounds.e, lng);
  state.bounds.w = Math.min(state.bounds.w, lng);
}

export const routeRecorder = {
  getStatus() { return state.status; },

  start({ title = "", visibility = "public" } = {}) {
    resetAll();
    state.status = "recording";
    state.title = String(title || "");
    state.visibility = visibility === "followers" ? "followers" : visibility === "private" ? "private" : "public";
    state.startedAt = Date.now();
  },

  onPoint(lat, lng, t = Date.now()) {
    if (state.status !== "recording") return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const p = { lat, lng, t: Number(t) || Date.now() };
    const last = state.path.length ? state.path[state.path.length - 1] : null;

    if (!last) {
      state.path.push(p);
      extendBounds(lat, lng);
      return;
    }

    const d = haversineMeters(last, p);
    if (d >= SAMPLE_MIN_M) {
      state.path.push(p);
      extendBounds(lat, lng);
      state.totalDistanceM += d;
    }
  },

  addStop({ title = "", note = "", lat, lng, t = Date.now() }) {
    if (state.status !== "recording") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const stop = {
      order: state.stops.length + 1,
      lat, lng, t: Number(t) || Date.now(),
      title: String(title || `Durak ${state.stops.length + 1}`),
      note: String(note || ""),
    };
    state.stops.push(stop);
    extendBounds(lat, lng);
    return stop;
  },

  finish() {
    if (state.status !== "recording" && state.status !== "finishing") return null;
    state.status = "finishing";
    state.finishedAt = Date.now();

    const durationMs = Math.max(0, state.finishedAt - (state.startedAt || state.finishedAt));
    const stats = {
      title: state.title,
      visibility: state.visibility,
      totalDistanceM: Math.round(state.totalDistanceM),
      durationMs,
      bounds: state.bounds ? { ...state.bounds } : null,
      pathCount: state.path.length,
      stopCount: state.stops.length,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
    };

    // recorder'ı boşalt
    resetAll();
    return stats;
  },

  cancel() { resetAll(); },

  getPath() { return state.path.slice(); },
  getStats() {
    const now = Date.now();
    const durationMs = Math.max(0, now - (state.startedAt || now));
    return {
      totalDistanceM: Math.round(state.totalDistanceM),
      durationMs,
      bounds: state.bounds ? { ...state.bounds } : null,
      pathCount: state.path.length,
      stopCount: state.stops.length,
      startedAt: state.startedAt,
    };
  },
};
