// FILE: src/pages/MyLive/LiveStream.jsx
// Layout: 2 video tam ekran (üst+alt), tüm butonlar video üzerinde overlay
// Siyah alt bant YOK — kamera hiç kesilmiyor
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
      <div style={{ position:"absolute", inset:0,
        background:"repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0px,rgba(0,0,0,.18) 1px,transparent 1px,transparent 3px)" }} />
      <div style={{ position:"absolute", inset:0,
        background:"radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,.65) 100%)" }} />
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
  const left = useRef(20 + Math.random() * 55).current;
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position:"absolute", bottom:"15%", left:`${left}%`,
      fontSize:32, animation:"floatUp 2.2s ease-out forwards",
      pointerEvents:"none", zIndex:30,
      filter:"drop-shadow(0 2px 8px rgba(0,0,0,.6))",
    }}>
      {emoji}
    </div>
  );
}

// ─── Emoji Fan Menü ───────────────────────────────────────────────────────────
const EMOJIS = ["😂","❤️","😍","🔥","👏","😮","💯","🎉"];
const CYAN    = "#00c8e0";
const MAGENTA = "#d946a8";

function EmojiFan({ onSelect }) {
  const [open, setOpen] = useState(false);
  const count  = EMOJIS.length; // 8
  // Fan açılır: yarım daire, sağ taraftan sola doğru
  // Açı aralığı: 180° → 360° (üst yarı daire, sola yayılır)
  const radius = 68; // px
  return (
    <div style={{ position:"relative", width:48, height:48 }}>
      {/* Fan emojileri */}
      {open && EMOJIS.map((e, i) => {
        // 180° → 360° aralığında eşit dağıt (8 emoji → 180/7 ≈ 25.7° aralık)
        const angle = 180 + (i / (count - 1)) * 180; // 180° → 360°
        const rad   = (angle * Math.PI) / 180;
        const x     = Math.cos(rad) * radius;
        const y     = Math.sin(rad) * radius;
        return (
          <button
            key={e}
            onClick={() => { onSelect(e); setOpen(false); }}
            style={{
              position:"absolute",
              left: `calc(50% + ${x}px - 20px)`,
              top:  `calc(50% + ${y}px - 20px)`,
              width:40, height:40, borderRadius:"50%",
              border:"1.5px solid rgba(255,255,255,.25)",
              background:"rgba(15,15,25,.85)",
              backdropFilter:"blur(12px)",
              fontSize:20, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              animation:"fanIn .22s ease-out forwards",
              boxShadow:"0 4px 16px rgba(0,0,0,.5)",
              zIndex:60,
            }}
          >
            {e}
          </button>
        );
      })}
      {/* Ana emoji butonu */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:48, height:48, borderRadius:"50%",
          border:`2px solid ${open ? CYAN : "rgba(255,255,255,.2)"}`,
          background: open
            ? `rgba(0,200,224,.2)`
            : "rgba(15,15,25,.75)",
          backdropFilter:"blur(16px)",
          fontSize:22, cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow: open ? `0 0 20px rgba(0,200,224,.4)` : "0 4px 16px rgba(0,0,0,.4)",
          transition:"all .2s",
          zIndex:61, position:"relative",
        }}
        title="Emoji Gönder"
      >
        {open ? "✕" : "😊"}
      </button>
    </div>
  );
}

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

  const [duration,    setDuration]    = useState(0);
  const [remoteReady, setRemoteReady] = useState(false);
  const [micOn,       setMicOn]       = useState(true);
  const [camOn,       setCamOn]       = useState(true);
  const [emojis,      setEmojis]      = useState([]);
  const [showBanner,  setShowBanner]  = useState(false);
  const [quality,     setQuality]     = useState(null);

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

  const sendEmoji = useCallback(async emoji => {
    setEmojis(p => [...p, { id: Date.now() + Math.random(), emoji, fromMe: true }]);
    if (roomId) {
      try { await sendEmojiReaction(roomId, emoji); } catch {}
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let initialized = false;
    const unsub = listenEmojiReactions(roomId, (data) => {
      if (!initialized) return;
      setEmojis(p => [...p, { id: Date.now() + Math.random(), emoji: data.emoji, fromMe: false }]);
    });
    const t = setTimeout(() => { initialized = true; }, 1000);
    return () => { unsub?.(); clearTimeout(t); };
  }, [roomId]);

  const removeEmoji = useCallback(id => {
    setEmojis(p => p.filter(e => e.id !== id));
  }, []);

  const fmt = s => String(Math.floor(s/60)).padStart(2,"0") + ":" + String(s%60).padStart(2,"0");
  const qColor = quality === "good" ? "#22c97a" : quality === "medium" ? "#f59e0b" : "#ff4757";
  const partnerName = partner?.displayName || partner?.adSoyad || partner?.kullaniciAdi || partner?.username || "Kullanıcı";
  const myName = user?.displayName || user?.adSoyad || user?.kullaniciAdi || user?.username || "Sen";

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position:"fixed", inset:0,
      display:"flex", flexDirection:"column",
      background:"#000",
      fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
      overflow:"hidden",
    }}>

      {/* ══════════ ÜST YARI — Karşı kullanıcı ══════════ */}
      <div style={{ flex:1, position:"relative", background:"#0a0a0a", minHeight:0 }}>
        {!remoteReady && <StaticNoise />}

        <video ref={remoteRef} autoPlay playsInline style={{
          position:"absolute", inset:0, width:"100%", height:"100%",
          objectFit:"cover", opacity: remoteReady ? 1 : 0, transition:"opacity .5s",
        }} />

        {/* Timer — sol üst */}
        <div style={{
          position:"absolute", top:12, left:12, zIndex:10,
          display:"flex", alignItems:"center", gap:6,
          background:"rgba(0,0,0,.55)", backdropFilter:"blur(12px)",
          border:"1px solid rgba(255,255,255,.12)", borderRadius:20, padding:"5px 12px",
        }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:MAGENTA, display:"block",
            boxShadow:`0 0 6px ${MAGENTA}`, animation:"blink 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize:13, fontWeight:700, color:"#fff", letterSpacing:1, fontVariantNumeric:"tabular-nums" }}>
            {fmt(duration)}
          </span>
        </div>

        {/* Bağlantı kalitesi — sağ üst */}
        {remoteReady && quality && (
          <div style={{
            position:"absolute", top:12, right:12, zIndex:10,
            display:"flex", alignItems:"center", gap:5,
            background:"rgba(0,0,0,.55)", backdropFilter:"blur(12px)",
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

        {/* Bağlanıyor spinner — sağ üst */}
        {!remoteReady && (
          <div style={{
            position:"absolute", top:12, right:12, zIndex:10,
            background:"rgba(0,0,0,.55)", backdropFilter:"blur(12px)",
            border:`1px solid rgba(0,200,224,.3)`, borderRadius:20, padding:"5px 12px",
            display:"flex", alignItems:"center", gap:6,
          }}>
            <div style={{ width:10, height:10, borderRadius:"50%",
              border:`2px solid ${CYAN}`, borderTopColor:"transparent", animation:"spin .8s linear infinite" }} />
            <span style={{ fontSize:11, color:CYAN, fontWeight:600 }}>Bağlanıyor</span>
          </div>
        )}

        {/* Partner isim — sol alt */}
        {remoteReady && (
          <div style={{
            position:"absolute", bottom:12, left:12, zIndex:10,
            display:"flex", alignItems:"center", gap:8,
            background:"rgba(0,0,0,.55)", backdropFilter:"blur(12px)",
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
          transform:"scaleX(-1)",
        }} />

        {!camOn && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
            background:"rgba(0,0,0,.7)", zIndex:2 }}>
            <span style={{ fontSize:40 }}>📷</span>
          </div>
        )}

        {/* Kendi isim — sol alt */}
        <div style={{
          position:"absolute", bottom:14, left:12, zIndex:10,
          display:"flex", alignItems:"center", gap:8,
          background:"rgba(0,0,0,.55)", backdropFilter:"blur(12px)",
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

        {/* ── Sağ alt overlay: Emoji fan + Mikrofon + Kamera + Geç + Bitir ── */}
        <div style={{
          position:"absolute", bottom:10, right:10, zIndex:50,
          display:"flex", flexDirection:"column", alignItems:"flex-end", gap:10,
        }}>
          {/* Üst sıra: Emoji fan */}
          <EmojiFan onSelect={sendEmoji} />

          {/* Alt sıra: Mikrofon, Kamera, Geç, Bitir */}
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {/* Mikrofon */}
            <button onClick={toggleMic} style={{
              width:42, height:42, borderRadius:"50%",
              border:`1.5px solid ${micOn ? "rgba(255,255,255,.2)" : "rgba(255,71,87,.6)"}`,
              background: micOn ? "rgba(15,15,25,.75)" : "rgba(255,71,87,.25)",
              backdropFilter:"blur(16px)",
              fontSize:18, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 4px 16px rgba(0,0,0,.4)",
            }} title={micOn?"Mikrofonu Kapat":"Mikrofonu Aç"}>
              {micOn ? "🎤" : "🔇"}
            </button>

            {/* Kamera */}
            <button onClick={toggleCam} style={{
              width:42, height:42, borderRadius:"50%",
              border:`1.5px solid ${camOn ? "rgba(255,255,255,.2)" : "rgba(255,71,87,.6)"}`,
              background: camOn ? "rgba(15,15,25,.75)" : "rgba(255,71,87,.25)",
              backdropFilter:"blur(16px)",
              fontSize:18, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 4px 16px rgba(0,0,0,.4)",
            }} title={camOn?"Kamerayı Kapat":"Kamerayı Aç"}>
              {camOn ? "📹" : "📷"}
            </button>

            {/* Geç */}
            <button onClick={handleSkip} style={{
              height:42, padding:"0 16px", borderRadius:24,
              border:`1.5px solid rgba(0,200,224,.4)`,
              background:"rgba(15,15,25,.75)", backdropFilter:"blur(16px)",
              color:CYAN, fontSize:13, fontWeight:700, cursor:"pointer",
              display:"flex", alignItems:"center", gap:6,
              boxShadow:`0 4px 16px rgba(0,200,224,.2)`,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
              </svg>
              Geç
            </button>

            {/* Bitir */}
            <button onClick={handleEnd} style={{
              width:48, height:48, borderRadius:"50%", border:"none", cursor:"pointer",
              background:"linear-gradient(135deg,#ff4757,#c0392b)",
              boxShadow:"0 4px 20px rgba(255,71,87,.5)",
              display:"flex", alignItems:"center", justifyContent:"center",
            }} title="Bağlantıyı Kes">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.11a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.17 0h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.15 7.91"/>
                <line x1="23" y1="1" x2="1" y2="23"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes floatUp { 0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(-180px) scale(1.4);opacity:0} }
        @keyframes fanIn   { 0%{transform:scale(.4);opacity:0} 100%{transform:scale(1);opacity:1} }
      `}</style>
    </div>
  );
}
