// src/icons.js
import React from "react";

/** Ortak props: size, className, title */
const svgBase = ({ size = 24, className, title }) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  role: "img",
  "aria-hidden": title ? undefined : "true",
  className,
});

/** IG’ye yakın outline: stroke≈1.8, round cap/join */
const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/* ───── Profil sekmeleri ───── */
export const GridIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.2" {...strokeProps} />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2" {...strokeProps} />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2" {...strokeProps} />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2" {...strokeProps} />
  </svg>
);

export const ClipsIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <rect x="3" y="4" width="18" height="16" rx="3" {...strokeProps} />
    <path d="M10 9 15 12 10 15Z" fill="currentColor" />
  </svg>
);

export const SavedIcon = ({ active = false, size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path
      d="M6 3h12a2 2 0 0 1 2 2v16l-8-4-8 4V5a2 2 0 0 1 2-2Z"
      {...(!active
        ? { ...strokeProps }
        : { fill: "currentColor", stroke: "currentColor", strokeWidth: 0 })}
    />
  </svg>
);

export const TaggedIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M20 12 12 20 4 12 12 4 20 12Z" {...strokeProps} />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
  </svg>
);

/* ───── Aksiyon / UI ikonları ───── */
export const CommentIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M21 7a3 3 0 0 0-3-3H6A3 3 0 0 0 3 7v8a3 3 0 0 0 3 3h8l5 3V7Z" {...strokeProps} />
  </svg>
);

export const ShareIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    {/* kâğıt uçak – IG’ye yakın oran */}
    <path d="M3 12 21 4l-5 8 5 8-18-8Z" {...strokeProps} />
  </svg>
);

/** Kebab (…): direction: "horizontal" | "vertical" */
export const KebabIcon = ({ direction = "horizontal", size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    {direction === "vertical" ? (
      <>
        <circle cx="12" cy="5" r="1.9" fill="currentColor" />
        <circle cx="12" cy="12" r="1.9" fill="currentColor" />
        <circle cx="12" cy="19" r="1.9" fill="currentColor" />
      </>
    ) : (
      <>
        <circle cx="5" cy="12" r="1.9" fill="currentColor" />
        <circle cx="12" cy="12" r="1.9" fill="currentColor" />
        <circle cx="19" cy="12" r="1.9" fill="currentColor" />
      </>
    )}
  </svg>
);

export const SaveIcon = SavedIcon;

export const StarIcon = ({ filled = false, size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path
      d="M12 17.3 18.2 21 16.5 13.9 22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21 12 17.3Z"
      {...(!filled
        ? { ...strokeProps }
        : { fill: "currentColor", stroke: "currentColor", strokeWidth: 0 })}
    />
  </svg>
);

/** Küçük clip rozeti (grid köşesi için) */
export const ClipBadge = ({ size = 18, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <rect x="4" y="6" width="16" height="12" rx="3" {...strokeProps} />
    <path d="M11 10.5v3l3-1.5-3-1.5Z" fill="currentColor" />
  </svg>
);

export const ChevronLeftIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M15 18 9 12l6-6" {...strokeProps} />
  </svg>
);
