// src/Icons.js
import React from "react";

const stroke = (active) => (active ? "#000" : "#999");

export const GridIcon = ({ active }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <g fill="none" stroke={stroke(active)} strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </g>
  </svg>
);

export const ReelsIcon = ({ active }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke={stroke(active)} strokeWidth="2" />
    <path d="M8 5L10 9M14 5l2 4" stroke={stroke(active)} strokeWidth="2" />
    <path d="M11 10.5v3l3-1.5-3-1.5Z" fill={stroke(active)} />
  </svg>
);

export const SavedIcon = ({ active }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"
      fill="none"
      stroke={stroke(active)}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export const TaggedIcon = ({ active }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="3" fill="none" stroke={stroke(active)} strokeWidth="2" />
    <path d="M4 20a8 8 0 0 1 16 0" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" />
  </svg>
);
