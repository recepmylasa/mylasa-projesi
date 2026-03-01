// FILE: src/CreateMenu.js
import React from "react";
import "./CreateMenu.css";

// İkonlar
const PostIcon = () => (
  <svg aria-label="Gönderi" height="24" role="img" viewBox="0 0 24 24" width="24">
    <path
      d="M2 12v3.45c0 2.849 2.15 5.168 4.998 5.168h10.004C19.85 20.618 22 18.299 22 15.45V8.552c0-2.849-2.15-5.168-4.998-5.168H6.998C4.15 3.384 2 5.703 2 8.552Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <line
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      x1="6.002"
      x2="18.002"
      y1="12.004"
      y2="12.004"
    />
    <line
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      x1="12.002"
      x2="12.002"
      y1="6.004"
      y2="18.004"
    />
  </svg>
);
const StoryIcon = () => (
  <svg aria-label="Hikaye" height="24" role="img" viewBox="0 0 24 24" width="24">
    <path
      d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <path
      d="M12 17.5a5.5 5.5 0 1 0-5.5-5.5 5.5 5.5 0 0 0 5.5 5.5Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);
const ClipsIcon = () => (
  <svg aria-label="Clips" height="24" role="img" viewBox="0 0 24 24" width="24">
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M19.49 19.49A9.99 9.99 0 1 1 22 12" />
      <path d="M10 9v6l5-3z" />
    </g>
  </svg>
);
const LiveIcon = () => (
  <svg aria-label="Canlı" height="24" role="img" viewBox="0 0 24 24" width="24">
    <rect
      fill="none"
      height="18"
      rx="4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      width="18"
      x="3"
      y="3"
    />
    <circle cx="12" cy="12" r="2.5" />
    <line
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      x1="16.5"
      x2="16.5"
      y1="7.5"
      y2="7.5"
    />
  </svg>
);
// YENİ: Check-in ikonu
const CheckInIcon = () => (
  <svg aria-label="Check-in Yap" height="24" fill="currentColor" role="img" viewBox="0 0 24 24" width="24">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

function CreateMenu({ onClose, onSelect }) {
  const handleStoryClick = () => {
    onClose();
    document.getElementById("hikaye-upload")?.click();
  };

  return (
    <div className="create-menu-overlay" onClick={onClose}>
      <div className="create-menu-content" onClick={(e) => e.stopPropagation()}>
        <div className="create-menu-header">
          <h2>Oluştur</h2>
        </div>
        <div className="create-menu-options">
          <button className="create-menu-item" onClick={() => onSelect("newpost")}>
            <span className="create-menu-label">Gönderi</span>
            <PostIcon />
          </button>
          <button className="create-menu-item" onClick={handleStoryClick}>
            <span className="create-menu-label">Hikaye</span>
            <StoryIcon />
          </button>
          {/* ✅ Rota aksiyonu YOK — Profile+ only kararına uygun */}
          <button className="create-menu-item" onClick={() => onSelect("checkin")}>
            <span className="create-menu-label">Check-in</span>
            <CheckInIcon />
          </button>
          <button className="create-menu-item" onClick={() => onSelect("newclip")}>
            <span className="create-menu-label">Clip</span>
            <ClipsIcon />
          </button>
          <button
            className="create-menu-item"
            onClick={() => alert("Canlı yayın yakında eklenecek!")}
          >
            <span className="create-menu-label">Canlı</span>
            <LiveIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateMenu;