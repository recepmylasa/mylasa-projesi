// src/utils/markerContent.js
export function makeAvatarOnlyContent(url, heightPx = 64) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.transform = "translate(-50%, -100%)";
  wrap.style.willChange = "transform";

  const img = document.createElement("img");
  img.src = url;
  img.alt = "avatar";
  img.style.height = `${heightPx}px`;
  img.style.width = "auto";
  img.style.display = "block";
  img.style.objectFit = "contain";
  img.style.filter = "drop-shadow(0 6px 12px rgba(0,0,0,.35))";
  wrap.appendChild(img);

  return wrap;
}

export function makeSelfContent({ url, heightPx = 68, name = "Ben", battery = null, headingDeg = null }) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.transform = "translate(-50%, -100%)";
  wrap.style.willChange = "transform";
  wrap.style.pointerEvents = "none";

  const cone = document.createElement("div");
  cone.style.position = "absolute";
  cone.style.left = "50%";
  cone.style.top = "100%";
  cone.style.width = "0";
  cone.style.height = "0";
  cone.style.borderLeft = "14px solid transparent";
  cone.style.borderRight = "14px solid transparent";
  cone.style.borderTop = "34px solid rgba(250, 204, 21, 0.35)";
  cone.style.transformOrigin = "50% 0%";
  cone.style.transform = `translate(-50%, -6px) rotate(${headingDeg ?? 0}deg)`;
  cone.style.filter = "blur(0.2px)";
  cone.style.display = headingDeg == null ? "none" : "block";
  wrap.appendChild(cone);

  const img = document.createElement("img");
  img.src = url;
  img.alt = "avatar";
  img.style.height = `${heightPx}px`;
  img.style.width = "auto";
  img.style.display = "block";
  img.style.objectFit = "contain";
  img.style.filter = "drop-shadow(0 6px 12px rgba(0,0,0,.35))";
  wrap.appendChild(img);

  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.left = "50%";
  label.style.top = "100%";
  label.style.transform = "translate(-50%, 8px)";
  label.style.background = "rgba(255,255,255,0.92)";
  label.style.color = "#111";
  label.style.fontSize = "12px";
  label.style.fontWeight = "700";
  label.style.padding = "3px 8px";
  label.style.borderRadius = "10px";
  label.style.boxShadow = "0 4px 10px rgba(0,0,0,.18)";
  label.style.display = "flex";
  label.style.alignItems = "center";
  label.style.gap = "6px";
  label.style.pointerEvents = "none";

  const nameSpan = document.createElement("span");
  nameSpan.textContent = name || "Ben";
  label.appendChild(nameSpan);

  const batWrap = document.createElement("div");
  batWrap.style.position = "relative";
  batWrap.style.width = "18px";
  batWrap.style.height = "10px";
  batWrap.style.border = "2px solid #111";
  batWrap.style.borderRadius = "2px";
  batWrap.style.boxSizing = "border-box";

  const cap = document.createElement("div");
  cap.style.position = "absolute";
  cap.style.right = "-3px";
  cap.style.top = "2px";
  cap.style.width = "2px";
  cap.style.height = "6px";
  cap.style.background = "#111";
  cap.style.borderRadius = "1px";
  batWrap.appendChild(cap);

  const fill = document.createElement("div");
  fill.style.position = "absolute";
  fill.style.left = "0";
  fill.style.top = "0";
  fill.style.bottom = "0";
  fill.style.width = battery == null ? "100%" : `${Math.max(3, Math.round((battery || 0) * 100))}%`;
  const color = battery == null ? "#888" : (battery > 0.5 ? "#16a34a" : battery > 0.2 ? "#d97706" : "#ef4444");
  fill.style.background = color;
  fill.style.borderRadius = "1px";
  if (battery == null) { fill.style.opacity = "0.55"; }
  batWrap.appendChild(fill);

  label.appendChild(batWrap);

  const pct = document.createElement("span");
  pct.style.fontWeight = "700";
  pct.style.fontSize = "11px";
  pct.style.minWidth = "26px";
  pct.style.textAlign = "right";
  pct.textContent = battery == null ? "—" : `${Math.round((battery || 0) * 100)}%`;
  label.appendChild(pct);

  wrap.appendChild(label);

  return { node: wrap, refs: { cone, nameSpan, fill, pct } };
}
