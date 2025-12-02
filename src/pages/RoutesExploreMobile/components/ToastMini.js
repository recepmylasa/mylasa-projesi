// src/pages/RoutesExploreMobile/components/ToastMini.jsx
// Küçük alt toast – login uyarısı vb. için.

import React from "react";

function ToastMini({ message }) {
  if (!message) return null;

  return <div className="explore-toast">{message}</div>;
}

export default ToastMini;
