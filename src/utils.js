// src/utils.js
export const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "";
  const date = timestamp?.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff} saniye önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)} dakika önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  if (diff > 604800)
    return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  return `${Math.floor(diff / 86400)} gün önce`;
};

export const formatCount = (n) => {
  if (typeof n !== "number") return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + "M";
  return (n / 1_000_000_000).toFixed(1) + "B";
};
