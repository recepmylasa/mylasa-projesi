// src/toast/newBadgeToast.js
let _cooldown = 0;

export default function newBadgeToast({ icon = "🏅", title = "Yeni rozet!", text = "" }) {
  const now = Date.now();
  if (now - _cooldown < 5000) return; // 5 sn spam koruma
  _cooldown = now;

  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.left = "12px";
  wrap.style.right = "12px";
  wrap.style.bottom = "12px";
  wrap.style.zIndex = "5000";
  wrap.style.display = "flex";
  wrap.style.justifyContent = "center";
  wrap.style.pointerEvents = "none";

  const card = document.createElement("div");
  card.style.pointerEvents = "auto";
  card.style.maxWidth = "520px";
  card.style.width = "100%";
  card.style.background = "#111";
  card.style.color = "#fff";
  card.style.padding = "12px 14px";
  card.style.borderRadius = "12px";
  card.style.boxShadow = "0 10px 28px rgba(0,0,0,.35)";
  card.style.display = "flex";
  card.style.alignItems = "center";
  card.style.gap = "10px";

  const i = document.createElement("div");
  i.textContent = icon;
  i.style.fontSize = "20px";
  card.appendChild(i);

  const content = document.createElement("div");
  const strong = document.createElement("div");
  strong.textContent = title;
  strong.style.fontWeight = "800";
  const small = document.createElement("div");
  small.textContent = text;
  small.style.opacity = "0.8";
  small.style.fontSize = "12px";
  content.appendChild(strong);
  content.appendChild(small);

  const close = document.createElement("button");
  close.textContent = "Tamam";
  close.style.marginLeft = "auto";
  close.style.background = "#6b5cff";
  close.style.color = "#fff";
  close.style.border = "none";
  close.style.borderRadius = "10px";
  close.style.padding = "8px 12px";
  close.style.fontWeight = "700";
  close.style.cursor = "pointer";
  close.onclick = () => document.body.removeChild(wrap);

  card.appendChild(content);
  card.appendChild(close);
  wrap.appendChild(card);
  document.body.appendChild(wrap);

  setTimeout(() => {
    try { document.body.removeChild(wrap); } catch {}
  }, 5000);
}
