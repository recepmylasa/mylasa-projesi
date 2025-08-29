// src/permalinkBoot.js
// Amaç: /c/:id veya /p/:id ile gelindiğinde App'i değil PermalinkPage'i tek başına render etmek.

import React from 'react';
import ReactDOM from 'react-dom/client';
import PermalinkPage from './PermalinkPage';

// URL çözümleyici
function getPathInfo() {
  const seg = window.location.pathname.split('/').filter(Boolean);
  if (seg.length !== 2) return null;
  const type = seg[0] === 'c' ? 'clip' : seg[0] === 'p' ? 'post' : null;
  const id = seg[1];
  if (!type || !id) return null;
  return { type, id };
}

// Eğer permalink ise, PermalinkPage'i mount et
const info = getPathInfo();
if (info) {
  let rootEl = document.getElementById('root');
  if (!rootEl) {
    rootEl = document.createElement('div');
    rootEl.id = 'root';
    document.body.appendChild(rootEl);
  }
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <PermalinkPage />
    </React.StrictMode>
  );
}

// Bu dosya sadece yan-etki için var; named export yok.
export {};
