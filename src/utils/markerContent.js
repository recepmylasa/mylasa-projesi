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

/**
 * Self marker içeriği:
 * - Sarı, yumuşak kenarlı koni (heading ile döner)
 * - Avatar
 * - Etiket: "Ben" + pil simgesi + % değer
 */
export function makeSelfContent({
  url,
  heightPx = 68,
  name = "Ben",
  battery = null,        // 0..1 veya null (bilinmiyor)
  headingDeg = null,     // 0..360 veya null (gizle)
}) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.transform = "translate(-50%, -100%)";
  wrap.style.willChange = "transform";
  wrap.style.pointerEvents = "none";

  // --- GPS KONİSİ (SARI, yumuşak kenarlı, ucu ayaklardan ileri uzanıyor)
  const cone = document.createElement("div");
  cone.style.position = "absolute";
  cone.style.left = "50%";
  cone.style.top = "100%";
  cone.style.width = "120px";
  cone.style.height = "90px";
  cone.style.transformOrigin = "50% 0%";
  // ucu üstte, aşağı doğru üçgen
  cone.style.clipPath = "polygon(50% 0%, 0% 100%, 100% 100%)";
  // sarıdan saydamlığa doğru yumuşak geçiş
  cone.style.background = "linear-gradient(to bottom, rgba(252,211,77,0.70), rgba(252,211,77,0.00))";
  // hafif blur, tatlı bir yumuşaklık
  cone.style.filter = "blur(2px)";
  // ucu ayağa yapışsın
  cone.style.transform = `translate(-50%, -4px) rotate(${headingDeg ?? 0}deg)`;
  cone.style.display = headingDeg == null ? "none" : "block";
  cone.style.pointerEvents = "none";
  wrap.appendChild(cone);

  // --- AVATAR
  const img = document.createElement("img");
  img.src = url;
  img.alt = "avatar";
  img.style.height = `${heightPx}px`;
  img.style.width = "auto";
  img.style.display = "block";
  img.style.objectFit = "contain";
  img.style.filter = "drop-shadow(0 6px 12px rgba(0,0,0,.35))";
  wrap.appendChild(img);

  // --- ETİKET: "Ben" + pil + %
  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.left = "50%";
  label.style.top = "100%";
  label.style.transform = "translate(-50%, 8px)";
  label.style.background = "rgba(255,255,255,0.92)";
  label.style.color = "#111";
  label.style.fontSize = "12px";
  label.style.fontWeight = "700";
  label.style.padding = "4px 10px";
  label.style.borderRadius = "14px";
  label.style.boxShadow = "0 6px 16px rgba(0,0,0,.20)";
  label.style.display = "flex";
  label.style.alignItems = "center";
  label.style.gap = "8px";
  label.style.pointerEvents = "none";

  const nameSpan = document.createElement("span");
  nameSpan.textContent = name || "Ben";
  label.appendChild(nameSpan);

  // Pil + yüzdeyi birlikte tutan sarmalayıcı (gap'i dinamik ayarlayacağız)
  const valueWrap = document.createElement("div");
  valueWrap.style.display = "flex";
  valueWrap.style.alignItems = "center";
  valueWrap.style.gap = "6px";

  // --- Pil simgesi (gerçeğe yakın görünüm)
  const batWrap = document.createElement("div");
  batWrap.style.position = "relative";
  batWrap.style.width = "22px";
  batWrap.style.height = "12px";
  batWrap.style.border = "2px solid #111";
  batWrap.style.borderRadius = "3px";
  batWrap.style.boxSizing = "border-box";
  batWrap.style.background = "#fff";

  // Kapak (sağ taraf)
  const cap = document.createElement("div");
  cap.style.position = "absolute";
  cap.style.right = "-3px";
  cap.style.top = "3px";
  cap.style.width = "3px";
  cap.style.height = "6px";
  cap.style.background = "#111";
  cap.style.borderRadius = "1px";
  batWrap.appendChild(cap);

  // Dolgu
  const fill = document.createElement("div");
  fill.style.position = "absolute";
  fill.style.left = "0";
  fill.style.top = "0";
  fill.style.bottom = "0";
  // min 3% dolu görünsün
  const pctInit = battery == null ? 1 : Math.max(0.03, (battery || 0));
  fill.style.width = battery == null ? "100%" : `${Math.round(pctInit * 100)}%`;
  const color = battery == null ? "#888" : (battery > 0.5 ? "#16a34a" : battery > 0.2 ? "#d97706" : "#ef4444");
  fill.style.background = `linear-gradient(180deg, ${color} 0%, ${color} 100%)`;
  fill.style.borderRadius = "1.5px";
  fill.style.transition = "width .2s linear";
  if (battery == null) fill.style.opacity = "0.55";
  batWrap.appendChild(fill);

  valueWrap.appendChild(batWrap);

  const pct = document.createElement("span");
  pct.style.fontWeight = "800";
  pct.style.fontSize = "11px";
  pct.style.minWidth = "22px";
  pct.style.textAlign = "right";
  pct.textContent = battery == null ? "—" : `${Math.round((battery || 0) * 100)}%`;
  valueWrap.appendChild(pct);

  label.appendChild(valueWrap);
  wrap.appendChild(label);

  return { node: wrap, refs: { cone, nameSpan, fill, pct, valueWrap } };
}
