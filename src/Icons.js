import React from "react";
import * as Ph from "@phosphor-icons/react";

/** name -> Phosphor component eşlemesi (merkezi registry) */
const registry = {
  // sekmeler & temel
  grid: Ph.SquaresFour,           // Gönderiler
  reels: Ph.FourK,                // Klipler (4K simgesi)
  checkin: Ph.MapPin,             // Check-in
  tagged: Ph.User,                // (uyumluluk için tutuluyor)
  bookmark: Ph.BookmarkSimple,
  star: Ph.Star,
  cards: Ph.StackSimple,          // **Kart/Kutu sekmesi (yeni)**
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

  // aksiyonlar (kritik)
  comment: Ph.ChatsCircle,
  share: Ph.PaperPlaneTilt,

  // Labubu / Gizli Kutu simgesi (ileride kullanılacak)
  mystery: Ph.Gift,
};

export function Icon({
  name,
  size = 24,
  color = "currentColor",
  weight = "regular",
  ...rest
}) {
  const Cmp = registry[name];
  if (!Cmp) {
    return <Ph.SquaresFour size={size} color={color} weight={weight} {...rest} />;
  }
  return <Cmp size={size} color={color} weight={weight} {...rest} />;
}

/* ---- Kısa yol export’lar ---- */
export const GridIcon     = (p) => <Icon name="grid"    {...p} />;
export const ClipsIcon    = (p) => <Icon name="reels"   {...p} />;
export const CheckinIcon  = (p) => <Icon name="checkin" {...p} />;
export const TaggedIcon   = (p) => <Icon name="tagged"  {...p} />;

export const CommentIcon = (p) => <Icon name="comment" {...p} />;
export const ShareIcon   = (p) => <Icon name="share"   {...p} />;
export const StarIcon    = (p) => <Icon name="star"    {...p} />;

/* Kart/Kutu sekmesi kısa yolu (StackSimple) */
export const CardsIcon   = (p) => <Icon name="cards"   {...p} />;

/* Kaydet (aktifken fill) */
export const SaveIcon = ({ active = false, size = 24, color = "currentColor", ...rest }) => (
  <Ph.BookmarkSimple size={size} color={color} weight={active ? "fill" : "regular"} {...rest} />
);
export const SavedIcon = SaveIcon;

/* Alt gezinti kısa yolları */
export const HomeIcon   = (p) => <Icon name="home"   {...p} />;
export const SearchIcon = (p) => <Icon name="search" {...p} />;
export const PlusIcon   = (p) => <Icon name="plus"   {...p} />;

/* UI ekstra */
export const ClipBadge        = (p) => <Icon name="clip-badge"    {...p} />;
export const QrIcon           = (p) => <Icon name="qr"            {...p} />;
export const ExternalLinkIcon = (p) => <Icon name="external-link" {...p} />;
export const StoryIcon        = (p) => <Icon name="story"         {...p} />;
export const HighlightIcon    = (p) => <Icon name="highlight"     {...p} />;
export const LiveIcon         = (p) => <Icon name="live"          {...p} />;
export const AdsIcon          = (p) => <Icon name="ads"           {...p} />;
export const ChannelIcon      = (p) => <Icon name="channel"       {...p} />;
export const HeartIcon        = (p) => <Icon name="heart"         {...p} />;
export const MessageIcon      = (p) => <Icon name="message"       {...p} />;
export const LocationIcon     = (p) => <Icon name="location"      {...p} />;

/* Kebab */
export const KebabIcon = ({ direction = "vertical", ...rest }) => (
  <Icon name={direction === "vertical" ? "menu-vertical" : "menu"} {...rest} />
);

/* Gizli Kutu kısa yolu (ileride profil içinde kullanacağız) */
export const MysteryBoxIcon = (p) => <Icon name="mystery" {...p} />;

/* UI ekstra */
export const ChevronLeftIcon   = (p) => <Ph.CaretLeft  weight="regular" {...p} />;
export const ChevronDownIcon   = (p) => <Ph.CaretDown  weight="regular" {...p} />;
export const VerifiedBadgeIcon = (p) => <Ph.SealCheck  weight="regular" {...p} />;
