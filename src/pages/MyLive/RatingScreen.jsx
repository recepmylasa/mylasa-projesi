// FILE: src/pages/MyLive/RatingScreen.jsx
import React, { useState } from "react";
import "../../styles/myLive.css";
import { rateConnection, blockUser, reportUser } from "../../services/myLiveService";

export default function RatingScreen({ connectionId, partner, user, duration, onDone }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [review, setReview] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [reported, setReported] = useState(false);
  const [loading, setLoading] = useState(false);

  const formatTime = (s) => {
    if (!s) return "0s";
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}d ${s % 60}s`;
  };

  const handleSubmit = async () => {
    if (rating === 0) { alert("Lütfen bir puan verin."); return; }
    setLoading(true);
    try {
      await rateConnection(connectionId, user?.uid, rating, review, blocked);
      if (blocked && partner?.userId) {
        await blockUser(user?.uid, partner.userId);
      }
      if (reported && partner?.userId) {
        await reportUser(user?.uid, partner.userId, "inappropriate", connectionId);
      }
    } catch (err) {
      console.error("[Rating] submit error:", err);
    } finally {
      setLoading(false);
      onDone?.();
    }
  };

  const displayRating = hovered || rating;

  return (
    <div className="mylive-rating">
      {/* Avatar */}
      <div className="mylive-rating-avatar">
        {partner?.photoURL
          ? <img src={partner.photoURL} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
          : "👤"}
      </div>

      <div className="mylive-rating-title">
        {partner?.displayName ?? partner?.username ?? "Kullanıcı"}
      </div>
      <div className="mylive-rating-subtitle">
        {duration ? `${formatTime(duration)} bağlantı` : "Bağlantı tamamlandı"} · Nasıldı?
      </div>

      {/* Stars */}
      <div className="mylive-stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            className={`mylive-star-btn ${star <= rating ? "selected" : ""}`}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
          >
            <span style={{ filter: star <= displayRating ? "none" : "grayscale(1) opacity(0.3)" }}>
              ⭐
            </span>
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div style={{ marginBottom: 16, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {["", "Kötü", "İdare eder", "İyi", "Çok iyi", "Mükemmel"][rating]}
        </div>
      )}

      {/* Comment */}
      <textarea
        className="mylive-rating-comment"
        placeholder="Yorum ekle (isteğe bağlı)..."
        value={review}
        onChange={(e) => setReview(e.target.value)}
        rows={3}
        maxLength={200}
      />

      {/* Actions */}
      <div className="mylive-rating-actions">
        <button
          className="mylive-rating-submit"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Kaydediliyor..." : "Değerlendirmeyi Gönder"}
        </button>

        {/* Block */}
        <div
          className="mylive-block-row"
          onClick={() => setBlocked((b) => !b)}
        >
          <div className={`mylive-block-checkbox ${blocked ? "checked" : ""}`}>
            {blocked && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
          </div>
          <span className="mylive-block-label">🚫 Bu kullanıcıyı engelle</span>
        </div>

        {/* Report */}
        <div
          className="mylive-block-row"
          style={{ borderColor: "rgba(255,165,0,0.2)", background: "rgba(255,165,0,0.05)" }}
          onClick={() => setReported((r) => !r)}
        >
          <div className={`mylive-block-checkbox ${reported ? "checked" : ""}`}
            style={{ borderColor: "rgba(255,165,0,0.5)", background: reported ? "rgba(255,165,0,0.8)" : "transparent" }}>
            {reported && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,165,0,0.9)", fontWeight: 600 }}>
            ⚠️ Uygunsuz içerik bildir
          </span>
        </div>

        {/* Skip rating */}
        <button
          onClick={onDone}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 13, cursor: "pointer", padding: "8px" }}
        >
          Atla
        </button>
      </div>
    </div>
  );
}
