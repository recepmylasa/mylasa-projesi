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

/** IG’ye yakın outline: stroke=2, round cap/join */
const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
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
    <path d="M3 12 21 4l-5 8 5 8-18-8Z" {...strokeProps} />
  </svg>
);

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

export const ChevronDownIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M6 9l6 6 6-6" {...strokeProps} />
  </svg>
);

export const VerifiedBadgeIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M12 2l2.3 2.1 3.2-.4 1.2 3 2.7 1.5-1 3 1 3-2.7 1.5-1.2 3-3.2-.4L12 22l-2.3-2.1-3.2.4-1.2-3L2.6 15l1-3-1-3L5.3 7.5l1.2-3 3.2.4L12 2Z" {...strokeProps}/>
    <path d="M9.5 12l1.8 1.8L15 10" {...strokeProps}/>
  </svg>
);

export const ExternalLinkIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M14 3h7v7" {...strokeProps} />
    <path d="M10 14L21 3" {...strokeProps} />
    <path d="M20 14v6a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1h6" {...strokeProps} />
  </svg>
);

export const PhoneIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8.2 9.2a16 16 0 0 0 6.6 6.6l.9-1.4a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6A2 2 0 0 1 22 16.9Z" {...strokeProps} />
  </svg>
);

export const MailIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <rect x="3" y="5" width="18" height="14" rx="2" {...strokeProps} />
    <path d="M3 7l9 6 9-6" {...strokeProps} />
  </svg>
);

export const QrIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3z" {...strokeProps} />
    <path d="M15 15h3v3h3" {...strokeProps} />
  </svg>
);

export const PlusIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M12 5v14M5 12h14" {...strokeProps} />
  </svg>
);

/* ───── CreateSheet ek ikonları ───── */
export const StoryIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <circle cx="12" cy="12" r="9" {...strokeProps} />
    <circle cx="12" cy="12" r="3" {...strokeProps} />
  </svg>
);

export const HighlightIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <circle cx="12" cy="12" r="9" {...strokeProps} />
    <path d="M7 12h10" {...strokeProps} />
  </svg>
);

export const LiveIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <rect x="3" y="7" width="18" height="10" rx="3" {...strokeProps} />
    <path d="M8 12h8" {...strokeProps} />
  </svg>
);

export const AdsIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <rect x="4" y="6" width="16" height="12" rx="2" {...strokeProps} />
    <path d="M6 9h12" {...strokeProps} />
  </svg>
);

export const ChannelIcon = ({ size, className, title }) => (
  <svg {...svgBase({ size, className, title })}>
    <path d="M4 7h16v10H4z" {...strokeProps} />
    <path d="M8 11h8" {...strokeProps} />
  </svg>
);
