// src/icons.js
import React from "react";
import * as Ph from "@phosphor-icons/react";

/** name -> Phosphor component eşlemesi */
const registry = {
  // sekmeler & temel
  grid: Ph.SquaresFour,
  reels: Ph.VideoCamera,            // Clips
  tagged: Ph.Tag,
  bookmark: Ph.BookmarkSimple,
  star: Ph.Star,
  "clip-badge": Ph.Play,
  qr: Ph.QrCode,
  "external-link": Ph.ArrowSquareOut,
  plus: Ph.Plus,
  story: Ph.Circle,
  highlight: Ph.HighlighterCircle,
  live: Ph.Broadcast,
  ads: Ph.MegaphoneSimple,
  channel: Ph.Radio,
  heart: Ph.Heart,
  message: Ph.Chats,
  location: Ph.MapPin,
  menu: Ph.DotsThree,
  "menu-vertical": Ph.DotsThreeVertical,

  // aksiyonlar (senin seçtiklerin)
  comment: Ph.ChatsCircle,      // <ChatsCircle />
  share: Ph.PaperPlaneTilt,     // <PaperPlaneTilt />
};

export function Icon({
  name,
  size = 24,
  color = "currentColor",
  weight = "regular",             // << kalınlık arttı
  ...rest
}) {
  const Cmp = registry[name];
  if (!Cmp) {
    return <Ph.SquaresFour size={size} color={color} weight={weight} {...rest} />;
  }
  return <Cmp size={size} color={color} weight={weight} {...rest} />;
}

/* ---- Eski adlarla export’lar (projeyi kırmadan) ---- */
export const GridIcon         = (p) => <Icon name="grid"         {...p} />;
export const ClipsIcon        = (p) => <Icon name="reels"        {...p} />;
export const TaggedIcon       = (p) => <Icon name="tagged"       {...p} />;

export const CommentIcon      = (p) => <Icon name="comment"      {...p} />;
export const ShareIcon        = (p) => <Icon name="share"        {...p} />;
export const StarIcon         = (p) => <Icon name="star"         {...p} />;

/* Kaydet */
export const SaveIcon = ({ active = false, size = 24, color = "currentColor", ...rest }) => (
  <Ph.BookmarkSimple
    size={size}
    color={color}
    weight={active ? "fill" : "regular"}
    {...rest}
  />
);
export const SavedIcon = SaveIcon;

export const ClipBadge        = (p) => <Icon name="clip-badge"   {...p} />;
export const QrIcon           = (p) => <Icon name="qr"           {...p} />;
export const ExternalLinkIcon = (p) => <Icon name="external-link"{...p} />;
export const PlusIcon         = (p) => <Icon name="plus"         {...p} />;
export const StoryIcon        = (p) => <Icon name="story"        {...p} />;
export const HighlightIcon    = (p) => <Icon name="highlight"    {...p} />;
export const LiveIcon         = (p) => <Icon name="live"         {...p} />;
export const AdsIcon          = (p) => <Icon name="ads"          {...p} />;
export const ChannelIcon      = (p) => <Icon name="channel"      {...p} />;

export const HeartIcon        = (p) => <Icon name="heart"        {...p} />;
export const MessageIcon      = (p) => <Icon name="message"      {...p} />;
export const LocationIcon     = (p) => <Icon name="location"     {...p} />;

/* Kebab */
export const KebabIcon = ({ direction = "horizontal", ...rest }) => (
  <Icon name={direction === "vertical" ? "menu-vertical" : "menu"} {...rest} />
);

/* UI’da sık kullanılan ekstra’lar */
export const ChevronLeftIcon   = (p) => <Ph.CaretLeft   weight="regular" {...p} />;
export const ChevronDownIcon   = (p) => <Ph.CaretDown   weight="regular" {...p} />;
export const VerifiedBadgeIcon = (p) => <Ph.SealCheck   weight="regular" {...p} />;
