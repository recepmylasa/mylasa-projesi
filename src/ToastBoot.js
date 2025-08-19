import React from 'react';
import { createRoot } from 'react-dom/client';
import './toast.css';

let container = null;
let root = null;
let idCounter = 0;
let pushFn = null;

function ToastHost() {
  const [items, setItems] = React.useState([]);

  React.useEffect(() => {
    pushFn = (item) => {
      setItems((prev) => [...prev, item]);
      const ttl = Math.max(1200, Math.min(item.duration || 2000, 6000));
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, ttl);
    };
    return () => { pushFn = null; };
  }, []);

  return (
    <div className="toast-container" role="status" aria-live="polite" aria-atomic="true">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.variant || ''}`} data-state="open">
          {t.message}
        </div>
      ))}
    </div>
  );
}

function ensureHost() {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-root';
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(<ToastHost />);
  }
}

export function showToast(message, opts = {}) {
  if (!message) return;
  ensureHost();
  const item = { id: ++idCounter, message, ...opts };
  if (pushFn) pushFn(item);
}
