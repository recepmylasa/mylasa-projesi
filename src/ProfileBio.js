// src/ProfileBio.jsx
import React, { useMemo } from "react";
import "./ProfileMobile.css"; // .profile-bio stilleri burada
import { VerifiedBadgeIcon, ExternalLinkIcon } from "./icons";

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    return v;
  }
  return "";
}

function normalizeLinks(user) {
  const primary = firstNonEmpty(user?.website, user?.web, user?.link) || null;

  const extras = Array.isArray(user?.links)
    ? user.links
        .map((l) => (typeof l === "string" ? l : l?.url))
        .filter(Boolean)
    : [];

  const all = [primary, ...extras].filter(Boolean);
  return Array.from(new Set(all));
}

function domainOf(url) {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

export default function ProfileBio({ user, username }) {
  const displayName = firstNonEmpty(
    user?.displayName,
    user?.adSoyad,
    user?.fullName,
    username
  );
  const verified = !!(
    user?.verified ||
    user?.metaVerified ||
    user?.isVerified
  );
  const bio = firstNonEmpty(
    user?.bio,
    user?.aciklama,
    user?.hakkinda,
    user?.about
  );

  const links = useMemo(() => normalizeLinks(user), [user]);
  const primary = links[0];
  const extraCount = Math.max(0, links.length - 1);

  return (
    <div className="profile-bio" aria-label="Profil tanımı">
      <div className="display-line">
        <span>{displayName}</span>
        {verified && (
          <span title="Doğrulanmış hesap" aria-label="Doğrulanmış hesap">
            <VerifiedBadgeIcon size={16} />
          </span>
        )}
      </div>

      {bio && <div className="bio-text">{bio}</div>}

      {(primary || extraCount > 0) && (
        <div className="link-row">
          {primary && (
            <a
              className="link-chip"
              href={/^https?:\/\//i.test(primary) ? primary : `https://${primary}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLinkIcon size={16} />
              <span>{domainOf(primary)}</span>
            </a>
          )}
          {extraCount > 0 && (
            <span className="link-chip" aria-label={`${extraCount} ek link`}>
              + {extraCount} diğer
            </span>
          )}
        </div>
      )}
    </div>
  );
}
