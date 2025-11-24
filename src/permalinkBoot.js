// src/permalinkBoot.js
// Amaç: /c/:id veya /p/:id ile gelindiğinde App'i değil PermalinkPage'i,
// /admin/share-metrics ile gelindiğinde admin telemetri panelini tek başına render etmek.

import React from "react";
import ReactDOM from "react-dom/client";
import PermalinkPage from "./PermalinkPage";
import AdminShareMetrics from "./pages/AdminShareMetrics";

function ensureRoot() {
  let rootEl = document.getElementById("root");
  if (!rootEl) {
    rootEl = document.createElement("div");
    rootEl.id = "root";
    document.body.appendChild(rootEl);
  }
  return rootEl;
}

// /p/:id veya /c/:id permalink mi?
function isPostOrClipPermalink(pathname) {
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length !== 2) return false;
  if (seg[0] !== "p" && seg[0] !== "c") return false;
  return /^[A-Za-z0-9_-]+$/.test(seg[1]);
}

const path = window.location.pathname;

if (isPostOrClipPermalink(path)) {
  const rootEl = ensureRoot();
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <PermalinkPage />
    </React.StrictMode>
  );
} else if (path === "/admin/share-metrics") {
  const rootEl = ensureRoot();
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <AdminShareMetrics />
    </React.StrictMode>
  );
}

// Bu dosya sadece yan-etki için var; named export yok.
export {};
