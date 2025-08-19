import React from 'react';

function Logo() {
  // --- TÜM STİL AYARLARI ARTIK BURADA ---
  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none'
  };

  const textStyle = {
    fontFamily: "'Pacifico', cursive",
    fontWeight: '400', // Bu fontun tek kalınlığı budur
    fontSize: '27px',
    color: '#262626',
    lineHeight: 1,
  };
  // -----------------------------------------

  // --- PNG LOGO YERİNE, KODLA ÇİZİLMİŞ SVG İKON ---
  const Icon = () => (
    <svg width="30" height="30" viewBox="0 0 32 32" style={{ height: '29px' }}>
      <defs>
        <linearGradient id="myIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#8a2be2' }} />
          <stop offset="100%" style={{ stopColor: '#4169e1' }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#myIconGradient)" />
      <text x="50%" y="50%" dy=".35em" textAnchor="middle" style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '17px',
        fontWeight: 'bold',
        fill: 'white',
      }}>my</text>
    </svg>
  );
  // ------------------------------------------------

  return (
    <div style={containerStyle} onClick={() => window.location.reload()}>
      <Icon />
      <span style={textStyle}>mylasa</span>
    </div>
  );
}

export default Logo;