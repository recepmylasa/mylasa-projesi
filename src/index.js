// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Permalink boot: /c/:id ve /p/:id durumunda tek başına PermalinkPage'i yükler.
import './permalinkBoot';

// URL'nin permalink olup olmadığını kontrol et
const isPermalink = (() => {
  const seg = window.location.pathname.split('/').filter(Boolean);
  return seg.length === 2 && (seg[0] === 'c' || seg[0] === 'p');
})();

// Sadece permalink DEĞİLSE ana uygulamayı mount et
if (!isPermalink) {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    const root = ReactDOM.createRoot(rootEl);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
}

// Performans ölçümü (opsiyonel)
reportWebVitals();
