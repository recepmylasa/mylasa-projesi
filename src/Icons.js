// src/icons.js
// Tek kaynak: /public/icons.svg içindeki <symbol>’ler.
// Kullanım: <Icon name="grid" size={22} className="..." title="..."/>
import React from "react";

export function Icon({ name, size = 24, className, title }) {
  const href = `/icons.svg#p-${name}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden={title ? undefined : "true"}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <use href={href} />
    </svg>
  );
}

/* Geriye dönük isimler (projede kullanılıyor olabilir) */
export const GridIcon   = (p) => <Icon name="grid"   {...p} />;
export const ClipsIcon  = (p) => <Icon name="reels"  {...p} />;
export const TaggedIcon = (p) => <Icon name="tagged" {...p} />;
export const ShareIcon  = (p) => <Icon name="share"  {...p} />;
export const SaveIcon   = (p) => <Icon name="save"   {...p} />;     // ileride sprite’a eklenecek
export const CommentIcon= (p) => <Icon name="comment"{...p} />;     // ileride sprite’a eklenecek
export const KebabIcon  = ({ direction="horizontal", ...rest }) => (
  <Icon name={direction === "vertical" ? "menu-vertical" : "menu"} {...rest} />
);
// Not: henüz sprite’ta olmayan isimler için ekleme turu yapacağız
