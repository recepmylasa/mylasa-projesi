// src/icons.js — Merkezi ikon sistemi (değişiklik yok)
import React from "react";
import * as Ph from "@phosphor-icons/react";

/** name -> Phosphor component eşlemesi (merkezi registry) */
const registry = {
  // sekmeler & temel
  grid: Ph.SquaresFour,
  reels: Ph.FourK,
  checkin: Ph.MapPin,
  tagged: Ph.User,
  bookmark: Ph.BookmarkSimple,
  star: Ph.Star,
  cards: Ph.StackSimple,
  "clip-badge": Ph.Play,
  qr: Ph.QrCode,
  "external-link": Ph.ArrowSquareOut,
  plus: Ph.Plus,

  // alt gezinti
  home: Ph.House,
  search: Ph.MagnifyingGlass,

  // diğerleri
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

  // aksiyonlar
  comment: Ph.ChatsCircle,
  share: Ph.PaperPlaneTilt,

  // Labubu / Gizli Kutu
  mystery: Ph.Gift,

  // harita/ayar
  settings: Ph.Gear,
  layers: Ph.MapTrifold,
  locate: (Ph.GpsFix || Ph.CrosshairSimple || Ph.Crosshair),
};

export function Icon({
  name,
  size = 24,
  color = "currentColor",
  weight = "regular",
  ...rest
}) {
  const Cmp = registry[name];
  if (!Cmp) return <Ph.SquaresFour size={size} color={color} weight={weight} {...rest} />;
  return <Cmp size={size} color={color} weight={weight} {...rest} />;
}

/* kısayollar */
export const GridIcon = (p) => <Icon name="grid" {...p} />;
export const ClipsIcon = (p) => <Icon name="reels" {...p} />;
export const CheckinIcon = (p) => <Icon name="checkin" {...p} />;
export const TaggedIcon = (p) => <Icon name="tagged" {...p} />;

export const CommentIcon = (p) => <Icon name="comment" {...p} />;
export const ShareIcon = (p) => <Icon name="share" {...p} />;
export const StarIcon = (p) => <Icon name="star" {...p} />;

export const CardsIcon = (p) => <Icon name="cards" {...p} />;
export const SaveIcon = ({ active = false, size = 24, color = "currentColor", ...rest }) => (
  <Ph.BookmarkSimple size={size} color={color} weight={active ? "fill" : "regular"} {...rest} />
);
export const SavedIcon = SaveIcon;

export const HomeIcon = (p) => <Icon name="home" {...p} />;
export const SearchIcon = (p) => <Icon name="search" {...p} />;
export const PlusIcon = (p) => <Icon name="plus" {...p} />;

export const ClipBadge = (p) => <Icon name="clip-badge" {...p} />;
export const QrIcon = (p) => <Icon name="qr" {...p} />;
export const ExternalLinkIcon = (p) => <Icon name="external-link" {...p} />;
export const StoryIcon = (p) => <Icon name="story" {...p} />;
export const HighlightIcon = (p) => <Icon name="highlight" {...p} />;
export const LiveIcon = (p) => <Icon name="live" {...p} />;
export const AdsIcon = (p) => <Icon name="ads" {...p} />;
export const ChannelIcon = (p) => <Icon name="channel" {...p} />;
export const HeartIcon = (p) => <Icon name="heart" {...p} />;
export const MessageIcon = (p) => <Icon name="message" {...p} />;
export const LocationIcon = (p) => <Icon name="location" {...p} />;

export const KebabIcon = ({ direction = "vertical", ...rest }) => (
  <Icon name={direction === "vertical" ? "menu-vertical" : "menu"} {...rest} />
);

export const MysteryBoxIcon = (p) => <Icon name="mystery" {...p} />;

export const ChevronLeftIcon = (p) => <Ph.CaretLeft weight="regular" {...p} />;
export const ChevronDownIcon = (p) => <Ph.CaretDown weight="regular" {...p} />;
export const VerifiedBadgeIcon = (p) => <Ph.SealCheck weight="regular" {...p} />;

export const LayersIcon = (p) => <Icon name="layers" {...p} />;
export const SettingsIcon = (p) => <Icon name="settings" {...p} />;
export const LocateIcon = (p) => <Icon name="locate" {...p} />;
