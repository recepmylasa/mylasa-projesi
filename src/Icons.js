// src/icons.js
import React from "react";

const line = (active) => ({
  fill: "none",
  stroke: active ? "#000" : "#8e8e8e",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

export const GridIcon = ({ active }) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" role="img">
    <rect x="3" y="3" width="8" height="8" {...line(active)} />
    <rect x="13" y="3" width="8" height="8" {...line(active)} />
    <rect x="3" y="13" width="8" height="8" {...line(active)} />
    <rect x="13" y="13" width="8" height="8" {...line(active)} />
  </svg>
);

export const ClipsIcon = ({ active }) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" role="img">
    <rect x="3" y="4" width="18" height="16" rx="3" {...line(active)} />
    <path d="M10 9 15 12 10 15Z" fill={active ? "#000" : "#8e8e8e"} />
    <path d="M7 4 10 10M13 4l3 6" {...line(active)} />
  </svg>
);

export const SavedIcon = ({ active }) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" role="img">
    <path
      d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"
      fill={active ? "#000" : "none"}
      stroke={active ? "#000" : "#8e8e8e"}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export const TaggedIcon = ({ active }) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" role="img">
    <path d="M20 12l-8 8-8-8 8-8 8 8Z" {...line(active)} />
    <circle cx="12" cy="12" r="2.2" fill={active ? "#000" : "#8e8e8e"} />
  </svg>
);
