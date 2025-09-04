// src/components/StarRatingV2/StarFeedbackAnimation.js
import React, { useEffect } from "react";

export default function StarFeedbackAnimation({ visible, value, onHide }) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onHide?.(), 800);
    return () => clearTimeout(t);
  }, [visible, onHide]);

  if (!visible || !value) return null;

  return (
    <div className="sr2-feedback-wrap" aria-hidden="true" onAnimationEnd={() => onHide?.()}>
      <div className="sr2-feedback">
        <svg className="sr2-feedback-star" viewBox="0 0 24 24" width="240" height="240">
          <defs>
            <linearGradient id="sr2-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFE27A" />
              <stop offset="100%" stopColor="#FFC20E" />
            </linearGradient>
          </defs>
          <path
            d="M12 2l2.955 6.201 6.844.996-4.95 4.826 1.169 6.817L12 17.77 5.982 20.84l1.169-6.817-4.95-4.826 6.844-.996L12 2z"
            fill="url(#sr2-gold)"
            stroke="#B78300"
            strokeWidth="1.2"
          />
        </svg>
        <div className="sr2-feedback-value">{value}</div>
      </div>
    </div>
  );
}
