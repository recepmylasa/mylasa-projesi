// src/icons.js
// Phosphor ikonları için tek giriş noktası.
// - String tabanlı <Icon name="..."/> (eski kodlar için)
// - Ad bazlı yardımcı export’lar (GridIcon, CommentIcon vb.)

import React from "react";
import {
  SquaresFour,
  FilmSlate,
  TagSimple,
  Chats,
  PaperPlaneTilt,
  BookmarkSimple,
  Star,
  FilmStrip,
  QrCode,
  ArrowSquareOut,
  Plus,
  Circle,
  CircleHalf,
  Broadcast,
  MegaphoneSimple,
  ChatsCircle,
  DotsThree,
  DotsThreeVertical,
  Heart,
  MapPin,
  SealCheck,
  CaretLeft,
  CaretDown,
} from "@phosphor-icons/react";

/* Ortak varsayılanlar: yumuşak/ince çizgi */
const DEF_SIZE = 24;
const DEF_WEIGHT = "regular";
const withDefaults = (p = {}) => ({
  size: p.size ?? DEF_SIZE,
  weight: p.weight ?? DEF_WEIGHT,
  color: p.color,
  className: p.className,
  alt: p.title,
});

/* İsim → Bileşen haritası (string tabanlı <Icon/> için) */
const ICONS = {
  grid: SquaresFour,
  reels: FilmSlate,
  tagged: TagSimple,
  comment: Chats,
  share: PaperPlaneTilt,
  bookmark: BookmarkSimple,
  star: Star,
  "clip-badge": FilmStrip,
  qr: QrCode,
  "external-link": ArrowSquareOut,
  plus: Plus,
  story: Circle,
  highlight: CircleHalf,
  live: Broadcast,
  ads: MegaphoneSimple,
  channel: ChatsCircle,
  menu: DotsThree,
  "menu-vertical": DotsThreeVertical,
  heart: Heart,
  message: Chats,
  location: MapPin,
  verified: SealCheck,
  "chevron-left": CaretLeft,
  "chevron-down": CaretDown,
};

/** String tabanlı API — ör: <Icon name="comment" size={20}/> */
export function Icon({ name, weight, ...rest }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  // Yorum ikonunu varsayılan duotone yap
  const w =
    weight ?? (name === "comment" || name === "message" ? "duotone" : undefined);
  return <Cmp {...withDefaults({ ...rest, weight: w })} />;
}

/* ---- Eski dosyalarla birebir uyumlu ad bazlı export’lar ---- */
/** Profil sekmeleri */
export const GridIcon   = (p) => <SquaresFour {...withDefaults(p)} />;
export const ClipsIcon  = (p) => <FilmSlate   {...withDefaults(p)} />;
export const TaggedIcon = (p) => <TagSimple   {...withDefaults(p)} />;

/** Aksiyon / UI */
export const CommentIcon = (p) =>
  <Chats {...withDefaults({ ...p, weight: "duotone" })} />; // seçimin
export const ShareIcon   = (p) => <PaperPlaneTilt {...withDefaults(p)} />;
export const SaveIcon    = ({ active, ...p }) =>
  <BookmarkSimple {...withDefaults({ ...p, weight: active ? "fill" : DEF_WEIGHT })} />;
export const SavedIcon   = (p) => <SaveIcon {...p} />;

export const StarIcon    = (p) => <Star {...withDefaults(p)} />;
export const ClipBadge   = (p) => <FilmStrip {...withDefaults(p)} />;

export const QrIcon         = (p) => <QrCode {...withDefaults(p)} />;
export const ExternalLinkIcon = (p) => <ArrowSquareOut {...withDefaults(p)} />;

export const PlusIcon      = (p) => <Plus {...withDefaults(p)} />;
export const StoryIcon     = (p) => <Circle {...withDefaults(p)} />;
export const HighlightIcon = (p) => <CircleHalf {...withDefaults(p)} />;
export const LiveIcon      = (p) => <Broadcast {...withDefaults(p)} />;
export const AdsIcon       = (p) => <MegaphoneSimple {...withDefaults(p)} />;
export const ChannelIcon   = (p) => <ChatsCircle {...withDefaults(p)} />;

/** Kebab menü */
export const KebabIcon = ({ direction = "horizontal", ...p }) =>
  direction === "vertical"
    ? <DotsThreeVertical {...withDefaults(p)} />
    : <DotsThree         {...withDefaults(p)} />;

/** Üst bar / rozeti / oklar */
export const HeartIcon          = (p) => <Heart {...withDefaults(p)} />;
export const MessageIcon        = (p) => <Chats {...withDefaults(p)} />;
export const LocationIcon       = (p) => <MapPin {...withDefaults(p)} />;
export const VerifiedBadgeIcon  = (p) => <SealCheck {...withDefaults(p)} />;
export const ChevronLeftIcon    = (p) => <CaretLeft {...withDefaults(p)} />;
export const ChevronDownIcon    = (p) => <CaretDown {...withDefaults(p)} />;
