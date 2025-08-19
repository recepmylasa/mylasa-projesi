// StarFeedbackAnimation.js
import React from "react";

/**
 * Props:
 * - visible: boolean
 * - value: number (1..5)
 */
export default function StarFeedbackAnimation({ visible, value }) {
  if (!visible || !value) return null;
  return (
    <div className="sr2-feedback-wrap" aria-hidden="true">
      <div className="sr2-feedback">
        <svg
          className="sr2-feedback-star"
          viewBox="0 0 24 24"
          width="240"
          height="240"
        >
          <path
            d="M12 2l2.955 6.201 6.844.996-4.95 4.826 1.169 6.817L12 17.77 5.982 20.84l1.169-6.817-4.95-4.826 6.844-.996L12 2z"
            fill="#FFD400"
            stroke="#D6A800"
            strokeWidth="1.2"
          />
        </svg>
        <div className="sr2-feedback-value">{value}</div>
      </div>
    </div>
  );
}
