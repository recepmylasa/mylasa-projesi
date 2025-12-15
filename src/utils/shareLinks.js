// src/utils/shareLinks.js
// Share link üretimini tek yerden yönetmek için küçük helper’lar.

function cleanParam(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s === "null" || s === "undefined") return null;
  return s;
}

/**
 * Route share link formatı:
 *   /s/r/:id?follow=1&owner=OWNER_UID (owner varsa)
 *
 * Not: App.js /s/r/:id → /r/:id?follow=1&from=share(&owner=...) normalize ediyor.
 */
export function buildShareRouteLink({ routeId, ownerUid, follow = true, origin } = {}) {
  const rid = cleanParam(routeId);
  if (!rid) return "";

  const base =
    cleanParam(origin) ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "");

  const params = new URLSearchParams();
  if (follow) params.set("follow", "1");

  const o = cleanParam(ownerUid);
  if (o) params.set("owner", o);

  const qs = params.toString();
  return `${base}/s/r/${encodeURIComponent(rid)}${qs ? `?${qs}` : ""}`;
}
