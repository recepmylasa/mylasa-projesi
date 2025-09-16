import React, { useEffect } from "react";
import { ExternalLinkIcon, PhoneIcon, MailIcon, QrIcon, ShareIcon } from "./icons";

function safeUrl(u) {
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export default function ProfileContactMenu({ open, onClose, user, username }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const shareUrl =
    (typeof window !== "undefined" && window.location?.href) || `/${username}`;

  const email =
    user?.email || user?.contactEmail || user?.iletisimEmail || null;
  const phone =
    user?.phone || user?.telefon || user?.tel || null;

  const primaryLink =
    user?.website || user?.web || user?.link || null;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: user?.displayName || username,
          text: `${username} profilini paylaş`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard?.writeText(shareUrl);
        alert("Profil bağlantısı kopyalandı.");
      }
      onClose?.();
    } catch { /* iptal edilmiş olabilir */ }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(shareUrl);
      alert("Profil bağlantısı kopyalandı.");
      onClose?.();
    } catch { /* noop */ }
  };

  const handleQr = () => {
    // İleride gerçek QR ekranına yönlendirme yapılabilir
    alert("QR kod ekranı yakında eklenecek.");
  };

  return (
    <>
      <div className="contact-menu-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className={`contact-menu-sheet open`}
        role="dialog"
        aria-modal="true"
        aria-label="İletişim ve paylaşım seçenekleri"
      >
        <div className="contact-menu-header">İletişim</div>

        <div className="contact-menu-list">
          <button className="contact-item" onClick={handleShare}>
            <ShareIcon size={20} />
            <div className="label">Profili paylaş</div>
          </button>

          <button className="contact-item" onClick={handleCopy}>
            <ExternalLinkIcon size={20} />
            <div className="label">Bağlantıyı kopyala</div>
          </button>

          {primaryLink && (
            <a
              className="contact-item"
              href={safeUrl(primaryLink)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLinkIcon size={20} />
              <div className="label">Web sitesi</div>
            </a>
          )}

          {email && (
            <a className="contact-item" href={`mailto:${email}`}>
              <MailIcon size={20} />
              <div className="label">E-posta</div>
            </a>
          )}

          {phone && (
            <a className="contact-item" href={`tel:${phone}`}>
              <PhoneIcon size={20} />
              <div className="label">Telefon</div>
            </a>
          )}

          <button className="contact-item" onClick={handleQr}>
            <QrIcon size={20} />
            <div className="label">QR Kodu</div>
          </button>
        </div>

        <div className="contact-helper">Bu seçenekler sadece bu profille paylaşılır.</div>
      </div>
    </>
  );
}
