// src/components/StarRatingV2/StarFeedbackAnimation.js
// Seçimden sonra ekranda küçük bir "pop" ve parıltı gösterir.
// Başka hiçbir şeye dokunmaz.

export function triggerStarFeedback({ x, y, value = 5, size = 40, duration = 700 }) {
  try {
    const host = document.createElement("div");
    host.className = "sr2-fx";
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    host.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" class="sr2-fx-star" aria-hidden="true">
        <path d="M12 2l2.955 6.201 6.844.996-4.95 4.826 1.169 6.817L12 17.77 5.982 20.84l1.169-6.817-4.95-4.826 6.844-.996L12 2z"
              fill="#FFD54F" stroke="#111" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="sr2-fx-burst"></div>
    `;
    document.body.appendChild(host);
    // animasyonu tetikle
    requestAnimationFrame(() => host.classList.add("on"));
    setTimeout(() => host.remove(), duration + 200);
  } catch (_) {}
}

export default triggerStarFeedback;
