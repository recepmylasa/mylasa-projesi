// src/store/panels.js
export const PANEL_NONE = "none";
export const PANEL_SEARCH = "search";
export const PANEL_LAYERS = "layers";
export const PANEL_SETTINGS = "settings";

export const initialPanelsState = { overlay: PANEL_NONE };

export function panelsReducer(state, action) {
  switch (action.type) {
    case "TOGGLE": {
      const next = action.payload;
      return { overlay: state.overlay === next ? PANEL_NONE : next };
    }
    case "CLOSE_ALL":
      return { overlay: PANEL_NONE };
    default:
      return state;
  }
}
