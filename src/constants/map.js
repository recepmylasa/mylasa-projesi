export const DEFAULT_CENTER = { lat: 39.0, lng: 35.0 };
export const DEFAULT_ZOOM = 5;
export const MOBILE_ZOOM = 14;

export const MAP_TYPES = {
  "Yol Haritası": "roadmap",
  "Uydu": "satellite",
  "Arazi": "terrain",
  "Hibrit": "hybrid",
};

export const SELECTED_MARKER_KEY = "__selected_place__";
export const SELF_MARKER_KEY = "__self__";

export const MIN_FAB_BOTTOM = 150;
export const FAB_EXTRA_LIFT = 36;

export const containerStyle = { position: "relative", width: "100%", height: "100vh" };

export const darkCircleBtn = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  background: "rgba(0,0,0,0.28)",
  border: 0,
  boxShadow: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

export const FALLBACK_STYLE = {
  width: "100%",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
  padding: 16,
};

// >>> Check-in yarıçapı (metre)
export const CHECKIN_RADIUS_M = 1000;
