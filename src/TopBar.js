// src/TopBar.js
// El yazısı "mylasa" + gradientli, modern, çizgisel MY logolu Instagram tarzı üst bar

function TopBar({ onLogoClick, onMessageClick, onNotificationsClick, onNewPostClick }) {
  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      height: 68,
      background: 'linear-gradient(92deg,#fff 58%,#fdc468 85%,#fa7e1e 97%,#d62976 113%,#962fbf 128%,#4f5bd5 145%)',
      borderBottom: '1.8px solid #f4cccc',
      boxShadow: '0 4px 24px #ffe8ef',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 18px',
      userSelect: 'none',
      minWidth: 0,
      transition: 'box-shadow 0.2s, background 0.2s',
    }}>
      {/* SOL: Çizgisel MY logo + gradientli el yazısı mylasa */}
      <div onClick={onLogoClick} tabIndex={0}
        style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',padding:'4px 9px',borderRadius:17,fontWeight:900}}>
        {/* Modern MY Logo - çizgisel kıvrımlı gradient */}
        <svg width="54" height="46" viewBox="0 0 54 46" style={{marginRight:3,filter:'drop-shadow(0 0 2.5px #f8e2ff)'}}>  
          <defs>
            <linearGradient id="myline" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fdc468" />
              <stop offset="32%" stopColor="#fa7e1e" />
              <stop offset="62%" stopColor="#d62976" />
              <stop offset="84%" stopColor="#962fbf" />
              <stop offset="100%" stopColor="#4f5bd5" />
            </linearGradient>
          </defs>
          {/* Kıvrımlı büyük M ve içinden çıkan küçük y çizgisi */}
          <path d="M5 38 Q17 10, 25 44 Q33 10, 49 37" stroke="url(#myline)" strokeWidth="4" fill="none" strokeLinecap="round"/>
          <path d="M27 29 Q36 41, 45 9" stroke="url(#myline)" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
        </svg>
        <span style={{
          fontFamily:'Pacifico, Comic Sans MS, cursive',
          fontWeight:700,
          fontSize:'2.09em',
          letterSpacing:'.02em',
          marginLeft:'.01em',
          background:'linear-gradient(90deg,#fdc468,#fa7e1e,#d62976,#962fbf,#4f5bd5)',
          WebkitBackgroundClip:'text',
          WebkitTextFillColor:'transparent',
          color: 'transparent',
          textShadow:'0 1px 18px #fff8',
          display:'inline-block',
          lineHeight: 1.05
        }}>mylasa</span>
      </div>
      {/* SAĞ: Kısa simge butonlar (yeni gönderi, mesaj, bildirim) */}
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <button
          onClick={onNewPostClick}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:'1.44em',color:'#fa7e1e',borderRadius:10,padding:'7px',outline:'none',transition:'background 0.15s'}}
          title="Yeni Gönderi"
        >
          <svg width="28" height="28" viewBox="0 0 26 26" fill="none" stroke="#fa7e1e" strokeWidth="2.3" strokeLinecap="round"><rect x="4.5" y="4.5" width="17" height="17" rx="5"/><path d="M13 8v8M8 13h10"/></svg>
        </button>
        <button
          onClick={onMessageClick}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:'1.44em',color:'#d62976',borderRadius:10,padding:'7px',outline:'none',transition:'background 0.15s'}}
          title="Mesajlar"
        >
          <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="#d62976" strokeWidth="2.2" strokeLinecap="round"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
        </button>
        <button
          onClick={onNotificationsClick}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:'1.44em',color:'#962fbf',borderRadius:10,padding:'7px',outline:'none',transition:'background 0.15s'}}
          title="Bildirimler"
        >
          <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="#962fbf" strokeWidth="2.2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </button>
      </div>
    </header>
  );
}

export default TopBar;
