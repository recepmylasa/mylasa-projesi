// FILE: src/pages/MyLive/LiveStream.jsx
// Layout: 3 katman — üst video (flex), alt video (flex), sabit alt bar
// Butonlar ASLA overflow:hidden içinde değil — her zaman görünür
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createRoom, joinRoom, listenRoom, addIceCandidate as fsAddIce,
  listenIceCandidates, closeRoom, leaveQueue, saveConnection,
  sendEmojiReaction, listenEmojiReactions,
} from "../../services/myLiveService";

// ─── Karıncalı TV efekti ─────────────────────────────────────────────────────
function StaticNoise() {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const draw = () => {
      const w = canvas.offsetWidth  || 360;
      const h = canvas.offsetHeight || 240;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const img = ctx.createImageData(w, h);
      const d   = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 200 + 20) | 0;
        d[i] = v; d[i+1] = v; d[i+2] = v; d[i+3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
      <canvas ref={canvasRef} style={{ width:"100%", height:"100%", display:"block", opacity:0.78 }} />
      {/* scan lines */}
      <div style={{ position:"absolute", inset:0,
        background:"repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0px,rgba(0,0,0,.18) 1px,transparent 1px,transparent 3px)" }} />
      {/* vignette */}
      <div style={{ position:"absolute", inset:0,
        background:"radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,.65) 100%)" }} />
      {/* yazı */}
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", gap:6 }}>
        <span style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,.65)",
          letterSpacing:2, fontFamily:"monospace", animation:"blink 1.4s step-end infinite" }}>
          ● SİNYAL BEKLENİYOR
        </span>
        <span style={{ fontSize:11, color:"rgba(255,255,255,.3)", fontFamily:"monospace", letterSpacing:1 }}>
          Eşleşme aranıyor...
        </span>
      </div>
    </div>
  );
}

// ─── Uçan emoji ──────────────────────────────────────────────────────────────
function FloatingEmoji({ emoji, onDone }) {
  const left = useRef(15 + Math.random() * 60).current;
  useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position:"absolute", bottom:"8%", left:`${left}%`,
      fontSize:28, animation:"floatUp 2s ease-out forwards", pointerEvents:"none", zIndex:20 }}>
      {emoji}
    </div>
  );
}

// ─── Sabitler ────────────────────────────────────────────────────────────────
const EMOJIS   = ["😂","❤️","😍","🔥","👏","😮","💯","💬"];
const CYAN     = "#00c8e0";
const MAGENTA  = "#d946a8";
const ICE_SERVERS = [
  { urls:"stun:stun.l.google.com:19302" },
  { urls:"stun:stun1.l.google.com:19302" },
  { urls:"stun:stun2.l.google.com:19302" },
  { urls:"stun:stun.services.mozilla.com" },
];

// ─── Ana bileşen ─────────────────────────────────────────────────────────────
export default function LiveStream({ roomId, isInitiator, partner, user, onEnd, onSkip }) {
  const localRef   = useRef(null);
  const remoteRef  = useRef(null);
  const peerRef    = useRef(null);
  const streamRef  = useRef(null);
  const unsubsRef  = useRef([]);
  const startRef   = useRef(Date.now());
  const connIdRef  = useRef("conn_" + Date.now() + "_" + Math.random().toString(36).slice(2));

  const [duration,     setDuration]     = useState(0);
  const [remoteReady,  setRemoteReady]  = useState(false);
  const [micOn,        setMicOn]        = useState(true);
  const [camOn,        setCamOn]        = useState(true);
  const [emojis,       setEmojis]       = useState([]);   // {id, emoji}
  const [showBanner,   setShowBanner]   = useState(false); // "Bağlantı kuruldu" banner
  const [quality,      setQuality]      = useState(null);  // "good"|"medium"|"poor"

  // Timer
  useEffect(() => {
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Bağlantı kalitesi
  useEffect(() => {
    const t = setInterval(async () => {
      const pc = peerRef.current;
      if (!pc || pc.connectionState !== "connected") return;
      try {
        const stats = await pc.getStats();
        let rtt = null;
        stats.forEach(s => { if (s.type === "candidate-pair" && s.state === "succeeded") rtt = s.currentRoundTripTime; });
        if (rtt !== null) setQuality(rtt < 0.15 ? "good" : rtt < 0.4 ? "medium" : "poor");
      } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, []);

  // WebRTC
  useEffect(() => {
    let alive = true;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = pc;

    pc.onconnectionstatechange = () => {
      if (!alive) return;
      if (pc.connectionState === "connected") {
        setRemoteReady(true);
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 3000);
      }
    };
    pc.ontrack = e => {
      if (!alive) return;
      if (remoteRef.current) { remoteRef.current.srcObject = e.streams[0]; setRemoteReady(true); }
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width:{ideal:1280}, height:{ideal:720}, facingMode:"user" },
          audio: { echoCancellation:true, noiseSuppression:true },
        });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        pc.onicecandidate = e => {
          if (e.candidate) fsAddIce(roomId, isInitiator ? "caller" : "callee", e.candidate).catch(() => {});
        };

        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await createRoom(roomId, { type:offer.type, sdp:offer.sdp });
          const u1 = listenRoom(roomId, async d => {
            if (d.answer && pc.signalingState === "have-local-offer")
              try { await pc.setRemoteDescription(new RTCSessionDescription(d.answer)); } catch {}
          });
          const u2 = listenIceCandidates(roomId, "callee", async c => {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          });
          unsubsRef.current = [u1, u2];
        } else {
          await new Promise((res, rej) => {
            const to = setTimeout(() => rej(new Error("offer timeout")), 15000);
            const u = listenRoom(roomId, d => { if (d?.offer) { clearTimeout(to); u(); res(d); } });
          }).then(async d => {
            await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await joinRoom(roomId, { type:answer.type, sdp:answer.sdp });
          });
          const u3 = listenIceCandidates(roomId, "caller", async c => {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          });
          unsubsRef.current = [u3];
        }
      } catch (err) { console.error("[LiveStream]", err); }
    })();

    return () => {
      alive = false;
      unsubsRef.current.forEach(u => u?.());
      pc.close(); peerRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleEnd = useCallback(async () => {
    const dur = Math.floor((Date.now() - startRef.current) / 1000);
    unsubsRef.current.forEach(u => u?.());
    peerRef.current?.close(); peerRef.current = null;
    await closeRoom(roomId).catch(() => {});
    await leaveQueue(user?.uid).catch(() => {});
    await saveConnection({ connectionId:connIdRef.current, user1Id:user?.uid, user2Id:partner?.userId, roomId, duration:dur }).catch(() => {});
    onEnd?.({ connectionId:connIdRef.current, partner, duration:dur });
  }, [roomId, user, partner, onEnd]);

  const handleSkip = useCallback(async () => {
    unsubsRef.current.forEach(u => u?.());
    peerRef.current?.close(); peerRef.current = null;
    await closeRoom(roomId).catch(() => {});
    onSkip?.();
  }, [roomId, onSkip]);

  const toggleMic = useCallback(() => {
    const t = streamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setMicOn(t.enabled); }
  }, []);

  const toggleCam = useCallback(() => {
    const t = streamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setCamOn(t.enabled); }
  }, []);

  // Emoji gönder: Firestore'a yaz (karşı taraf da görsün)
  const sendEmoji = useCallback(async emoji => {
    // Önce kendinde göster
    setEmojis(p => [...p, { id: Date.now() + Math.random(), emoji, fromMe: true }]);
    // Firestore'a yaz
    if (roomId) {
      try { await sendEmojiReaction(roomId, emoji); } catch {}
    }
  }, [roomId]);

  // Karşı taraftan gelen emojileri dinle
  useEffect(() => {
    if (!roomId) return;
    // Başlangıçta gelen eski emojileri yoksay - sadece yeni gelenleri al
    let initialized = false;
    const unsub = listenEmojiReactions(roomId, (data) => {
      if (!initialized) return; // İlk snapshot'ı atla
      setEmojis(p => [...p, { id: Date.now() + Math.random(), emoji: data.emoji, fromMe: false }]);
    });
    // Kısa gecikme sonrası initialized = true yap
    const t = setTimeout(() => { initialized = true; }, 1000);
    return () => { unsub?.(); clearTimeout(t); };
  }, [roomId]);

  const removeEmoji = useCallback(id => {
    setEmojis(p => p.filter(e => e.id !== id));
  }, []);

  // ─── Yardımcılar ───────────────────────────────────────────────────────────
  const fmt = s => String(Math.floor(s/60)).padStart(2,"0") + ":" + String(s%60).padStart(2,"0");
  const qColor = quality === "good" ? "#22c97a" : quality === "medium" ? "#f59e0b" : "#ff4757";
  const partnerName = partner?.displayName || partner?.username || "Kullanıcı";
  const myName      = user?.adSoyad?.split(" ")[0] || user?.kullaniciAdi || user?.displayName?.split(" ")[0] || "Sen";

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position:"fixed", inset:0,
      display:"flex", flexDirection:"column",
      background:"#000",
      fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
    }}>

      {/* ══════════ ÜST YARI — Karşı kullanıcı ══════════ */}
      <div style={{ flex:1, position:"relative", background:"#0a0a0a", minHeight:0 }}>
        {!remoteReady && <StaticNoise />}

        <video ref={remoteRef} autoPlay playsInline style={{
          position:"absolute", inset:0, width:"100%", height:"100%",
          objectFit:"cover", opacity: remoteReady ? 1 : 0, transition:"opacity .5s",
        }} />

        {/* Timer */}
        <div style={{
          position:"absolute", top:12, left:12, zIndex:10,
          display:"flex", alignItems:"center", gap:6,
          background:"rgba(0,0,0,.6)", backdropFilter:"blur(12px)",
          border:"1px solid rgba(255,255,255,.12)", borderRadius:20, padding:"5px 12px",
        }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:MAGENTA, display:"block",
            boxShadow:`0 0 6px ${MAGENTA}`, animation:"blink 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize:13, fontWeight:700, color:"#fff", letterSpacing:1, fontVariantNumeric:"tabular-nums" }}>
            {fmt(duration)}
          </span>
        </div>

        {/* Bağlantı kalitesi */}
        {remoteReady && quality && (
          <div style={{
            position:"absolute", top:12, right:12, zIndex:10,
            display:"flex", alignItems:"center", gap:5,
            background:"rgba(0,0,0,.6)", backdropFilter:"blur(12px)",
            border:`1px solid ${qColor}40`, borderRadius:20, padding:"5px 10px",
          }}>
            <div style={{ display:"flex", gap:2, alignItems:"flex-end" }}>
              {[1,2,3].map(b => (
                <div key={b} style={{ width:4, height:4+b*4, borderRadius:2,
                  background:(quality==="good"||(quality==="medium"&&b<=2)||(quality==="poor"&&b<=1)) ? qColor : "rgba(255,255,255,.2)" }} />
              ))}
            </div>
            <span style={{ fontSize:11, color:qColor, fontWeight:600 }}>
              {quality==="good"?"İyi":quality==="medium"?"Orta":"Zayıf"}
            </span>
          </div>
        )}

        {/* Bağlanıyor spinner */}
        {!remoteReady && (
          <div style={{
            position:"absolute", top:12, right:12, zIndex:10,
            background:"rgba(0,0,0,.6)", backdropFilter:"blur(12px)",
            border:`1px solid rgba(0,200,224,.3)`, borderRadius:20, padding:"5px 12px",
            display:"flex", alignItems:"center", gap:6,
          }}>
            <div style={{ width:10, height:10, borderRadius:"50%",
              border:`2px solid ${CYAN}`, borderTopColor:"transparent", animation:"spin .8s linear infinite" }} />
            <span style={{ fontSize:11, color:CYAN, fontWeight:600 }}>Bağlanıyor</span>
          </div>
        )}

        {/* Partner isim - sol alt */}
        {remoteReady && (
          <div style={{
            position:"absolute", bottom:12, left:12, zIndex:10,
            display:"flex", alignItems:"center", gap:8,
            background:"rgba(0,0,0,.6)", backdropFilter:"blur(12px)",
            border:"1px solid rgba(255,255,255,.12)", borderRadius:24, padding:"6px 14px 6px 8px",
          }}>
            <div style={{ width:28, height:28, borderRadius:"50%",
              background:`linear-gradient(135deg,${CYAN},${MAGENTA})`,
              overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {partner?.photoURL
                ? <img src={partner.photoURL} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <span style={{ fontSize:14 }}>👤</span>}
            </div>
            <span style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{partnerName}</span>
          </div>
        )}

        {/* Bağlantı kuruldu banner */}
        {showBanner && (
          <div style={{
            position:"absolute", bottom:12, left:"50%", transform:"translateX(-50%)", zIndex:15,
            background:"rgba(0,0,0,.75)", backdropFilter:"blur(16px)",
            border:`1px solid rgba(34,201,122,.4)`, borderRadius:12, padding:"8px 16px",
            display:"flex", alignItems:"center", gap:8, whiteSpace:"nowrap",
          }}>
            <span style={{ fontSize:13, color:"#22c97a", fontWeight:600 }}>✓ Bağlantı kuruldu</span>
            {partner?.photoURL
              ? <img src={partner.photoURL} alt="" style={{ width:20, height:20, borderRadius:"50%", objectFit:"cover" }} />
              : null}
            <span style={{ fontSize:13, color:"#fff" }}>{partnerName}</span>
          </div>
        )}

        {/* Uçan emojiler — üst yarıda göster */}
        {emojis.map(e => (
          <FloatingEmoji key={e.id} emoji={e.emoji} onDone={() => removeEmoji(e.id)} />
        ))}
      </div>

      {/* ══════════ BÖLME ══════════ */}
      <div style={{
        height:3, flexShrink:0,
        background:`linear-gradient(90deg,transparent,${CYAN},${MAGENTA},${CYAN},transparent)`,
        boxShadow:`0 0 12px rgba(0,200,224,.5)`,
      }} />

      {/* ══════════ ALT YARI — Kendi kameran ══════════ */}
      <div style={{ flex:1, position:"relative", background:"#050505", minHeight:0 }}>
        <video ref={localRef} autoPlay playsInline muted style={{
          position:"absolute", inset:0, width:"100%", height:"100%",
          objectFit:"cover", opacity: camOn ? 1 : 0.15,
        transform: "scaleX(-1)",
        }} />

        {!camOn && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
            background:"rgba(0,0,0,.7)", zIndex:2 }}>
            <span style={{ fontSize:40 }}>📷</span>
          </div>
        )}

        {/* Kendi isim - sol alt */}
        <div style={{
          position:"absolute", bottom:12, left:12, zIndex:10,
          display:"flex", alignItems:"center", gap:8,
          background:"rgba(0,0,0,.6)", backdropFilter:"blur(12px)",
          border:"1px solid rgba(255,255,255,.12)", borderRadius:24, padding:"6px 14px 6px 8px",
        }}>
          <div style={{ width:28, height:28, borderRadius:"50%",
            background:`linear-gradient(135deg,${MAGENTA},${CYAN})`,
            overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              : <span style={{ fontSize:14 }}>👤</span>}
          </div>
          <span style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{myName}</span>
          <span style={{ fontSize:10, color:CYAN, fontWeight:700,
            background:"rgba(0,200,224,.15)", borderRadius:8, padding:"2px 6px" }}>SEN</span>
        </div>

        {/* GEÇ butonu - sağ alt */}
        <button onClick={handleSkip} style={{
          position:"absolute", bottom:12, right:12, zIndex:10,
          display:"flex", alignItems:"center", gap:7, padding:"9px 18px",
          borderRadius:28, border:`1.5px solid rgba(0,200,224,.4)`,
          background:"rgba(0,0,0,.65)", backdropFilter:"blur(16px)",
          color:CYAN, fontSize:14, fontWeight:700, cursor:"pointer",
          boxShadow:`0 4px 20px rgba(0,200,224,.2)`,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
          </svg>
          Geç
        </button>
      </div>

      {/* ══════════ SABİT ALT BAR — OmeTV stili ══════════ */}
      <div style={{
        flexShrink:0,
        background:"rgba(0,0,0,.88)", backdropFilter:"blur(20px)",
        borderTop:"1px solid rgba(255,255,255,.08)",
        padding:"10px 16px 12px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        gap:8, zIndex:50,
      }}>
        {/* Sol: Yenile (geç) */}
        <button onClick={handleSkip} style={{
          width:44, height:44, borderRadius:"50%", border:"none", cursor:"pointer",
          background:"rgba(255,255,255,.1)", display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:20, flexShrink:0,
        }} title="Geç">
          🔄
        </button>

        {/* Orta: Emoji bar */}
        <div style={{ display:"flex", gap:6, flex:1, justifyContent:"center", flexWrap:"nowrap", overflow:"hidden" }}>
          {EMOJIS.map(e => (
            <button key={e} onClick={() => sendEmoji(e)} style={{
              width:38, height:38, borderRadius:"50%", border:"none", cursor:"pointer",
              background:"rgba(255,255,255,.08)", fontSize:18,
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"background .15s", flexShrink:0,
            }}>
              {e}
            </button>
          ))}
        </div>

        {/* Sağ: Mikrofon + Kamera + Bitir */}
        <div style={{ display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
          <button onClick={toggleMic} style={{
            width:38, height:38, borderRadius:"50%", border:"none", cursor:"pointer",
            background: micOn ? "rgba(255,255,255,.1)" : "rgba(255,71,87,.8)",
            fontSize:16, display:"flex", alignItems:"center", justifyContent:"center",
          }} title={micOn?"Mikrofonu Kapat":"Mikrofonu Aç"}>
            {micOn ? "🎤" : "🔇"}
          </button>

          <button onClick={toggleCam} style={{
            width:38, height:38, borderRadius:"50%", border:"none", cursor:"pointer",
            background: camOn ? "rgba(255,255,255,.1)" : "rgba(255,71,87,.8)",
            fontSize:16, display:"flex", alignItems:"center", justifyContent:"center",
          }} title={camOn?"Kamerayı Kapat":"Kamerayı Aç"}>
            {camOn ? "📹" : "📷"}
          </button>

          <button onClick={handleEnd} style={{
            width:44, height:44, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"linear-gradient(135deg,#ff4757,#c0392b)",
            boxShadow:"0 4px 16px rgba(255,71,87,.45)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }} title="Bağlantıyı Kes">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.11a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.17 0h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.15 7.91"/>
              <line x1="23" y1="1" x2="1" y2="23"/>
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes floatUp { 0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(-160px) scale(1.3);opacity:0} }
      `}</style>
    </div>
  );
}
