// FILE: src/pages/MyLive/LiveStream.jsx
// Premium layout: sol sütun (kamera/mikrofon, chat, emoji), sağ sütun (geç, bitir)
// Logo watermark sol alt, ekran kaydı sağ alt (bölme çizgisi altında)
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createRoom, joinRoom, listenRoom, addIceCandidate as fsAddIce,
  listenIceCandidates, closeRoom, leaveQueue, saveConnection,
  sendEmojiReaction, listenEmojiReactions,
  sendChatMessage, listenChatMessages,
} from "../../services/myLiveService";

const CYAN    = "#00c8e0";
const MAGENTA = "#d946a8";

// ─── Karıncalı TV efekti ──────────────────────────────────────────────────────
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
  const left = useRef(15 + Math.random() * 50).current;
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position:"absolute", bottom:"20%", left:`${left}%`,
      fontSize:30, animation:"floatUp 2.2s ease-out forwards",
      pointerEvents:"none", zIndex:30,
      filter:"drop-shadow(0 2px 8px rgba(0,0,0,.6))",
    }}>
      {emoji}
    </div>
  );
}

// ─── Küçük yuvarlak overlay buton ────────────────────────────────────────────
function OBtn({ onClick, children, active, activeColor, title, size = 44 }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: size, height: size, borderRadius:"50%", border:"none", cursor:"pointer",
        background: active
          ? `rgba(${activeColor || "255,71,87"},.25)`
          : "rgba(15,15,25,.78)",
        backdropFilter:"blur(16px)",
        boxShadow: active
          ? `0 0 14px rgba(${activeColor || "255,71,87"},.45), inset 0 0 0 1.5px rgba(${activeColor || "255,71,87"},.6)`
          : "0 3px 12px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.1)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize: size > 40 ? 20 : 17,
        transition:"all .18s",
        flexShrink:0,
      }}
    >
      {children}
    </button>
  );
}

// ─── Emoji Fan (sağa yatay açılır, 2 sıra 4'lü) ─────────────────────────────
const EMOJIS = ["😂","❤️","😍","🔥","👏","😮","💯","🎉"];

function EmojiFan({ onSelect }) {
  const [open, setOpen] = useState(false);
  const row1 = EMOJIS.slice(0, 4);
  const row2 = EMOJIS.slice(4, 8);
  return (
    <div style={{ position:"relative" }}>
      {open && (
        <div style={{
          position:"absolute",
          bottom:"50%", left:"110%",
          display:"flex", flexDirection:"column", gap:5,
          zIndex:80,
          background:"rgba(8,8,18,.82)",
          backdropFilter:"blur(16px)",
          border:"1px solid rgba(255,255,255,.1)",
          borderRadius:14,
          padding:"8px 8px",
          boxShadow:"0 8px 28px rgba(0,0,0,.6)",
        }}>
          {[row1, row2].map((row, ri) => (
            <div key={ri} style={{ display:"flex", flexDirection:"row", gap:5 }}>
              {row.map((e, i) => (
                <button
                  key={e}
                  onClick={() => { onSelect(e); setOpen(false); }}
                  style={{
                    width:36, height:36, borderRadius:"50%",
                    border:"1.5px solid rgba(255,255,255,.15)",
                    background:"rgba(255,255,255,.06)",
                    fontSize:18, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    animation:`fanIn .1s ease-out ${(ri*4+i) * 0.025}s both`,
                    transition:"transform .1s",
                  }}
                  onMouseEnter={ev => ev.currentTarget.style.transform="scale(1.18)"}
                  onMouseLeave={ev => ev.currentTarget.style.transform="scale(1)"}
                >
                  {e}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <OBtn onClick={() => setOpen(o => !o)} active={open} activeColor="0,200,224" title="Emoji Gönder" size={44}>
        {open ? "✕" : "😊"}
      </OBtn>
    </div>
  );
}

// ─── Kamera/Mikrofon açılır menü (sağa açılır) ───────────────────────────────
function MediaMenu({ micOn, camOn, onToggleMic, onToggleCam }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position:"relative" }}>
      {open && (
        <div style={{
          position:"absolute",
          bottom:"50%", left:"110%",
          display:"flex", flexDirection:"row", gap:6,
          alignItems:"center",
          zIndex:80,
          background:"rgba(8,8,18,.82)",
          backdropFilter:"blur(16px)",
          border:"1px solid rgba(255,255,255,.1)",
          borderRadius:14,
          padding:"6px 8px",
          boxShadow:"0 8px 28px rgba(0,0,0,.6)",
        }}>
          {/* Kamera */}
          <button
            onClick={() => { onToggleCam(); }}
            style={{
              width:38, height:38, borderRadius:"50%",
              border:`1.5px solid ${camOn ? "rgba(255,255,255,.2)" : "rgba(255,71,87,.6)"}`,
              background: camOn ? "rgba(12,12,22,.88)" : "rgba(255,71,87,.2)",
              backdropFilter:"blur(14px)",
              fontSize:18, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              animation:"fanIn .15s ease-out .04s both",
              boxShadow:"0 4px 14px rgba(0,0,0,.5)",
            }}
            title={camOn ? "Kamerayı Kapat" : "Kamerayı Aç"}
          >
            {camOn ? "📹" : "📷"}
          </button>
          {/* Mikrofon */}
          <button
            onClick={() => { onToggleMic(); }}
            style={{
              width:38, height:38, borderRadius:"50%",
              border:`1.5px solid ${micOn ? "rgba(255,255,255,.2)" : "rgba(255,71,87,.6)"}`,
              background: micOn ? "rgba(12,12,22,.88)" : "rgba(255,71,87,.2)",
              backdropFilter:"blur(14px)",
              fontSize:18, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              animation:"fanIn .15s ease-out 0s both",
              boxShadow:"0 4px 14px rgba(0,0,0,.5)",
            }}
            title={micOn ? "Mikrofonu Kapat" : "Mikrofonu Aç"}
          >
            {micOn ? "🎤" : "🔇"}
          </button>
        </div>
      )}
      <OBtn onClick={() => setOpen(o => !o)} active={!micOn || !camOn} activeColor="255,71,87" title="Kamera / Mikrofon" size={44}>
        {!micOn ? "🔇" : !camOn ? "📷" : "🎙️"}
      </OBtn>
    </div>
  );
}

// ─── Chat Paneli ──────────────────────────────────────────────────────────────
function ChatPanel({ messages, myUid, onSend, onClose, inputRef }) {
  const bottomRef = useRef(null);
  const [text, setText] = useState("");
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t); setText("");
  };
  return (
    <div style={{
      position:"absolute", bottom:0, left:0, right:0, height:"56%",
      background:"rgba(6,6,16,.86)", backdropFilter:"blur(24px)",
      borderTop:`1px solid rgba(0,200,224,.2)`,
      display:"flex", flexDirection:"column",
      zIndex:75, borderRadius:"14px 14px 0 0",
      animation:"slideUp .2s ease-out",
    }}>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"9px 14px 7px",
        borderBottom:"1px solid rgba(255,255,255,.06)", flexShrink:0,
      }}>
        <span style={{ fontSize:12, fontWeight:700, color:CYAN, letterSpacing:.5 }}>💬 Mesajlar</span>
        <button onClick={onClose} style={{
          background:"none", border:"none", color:"rgba(255,255,255,.45)",
          fontSize:17, cursor:"pointer", lineHeight:1, padding:4,
        }}>✕</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"8px 10px", display:"flex", flexDirection:"column", gap:5 }}>
        {messages.length === 0 && (
          <div style={{ textAlign:"center", color:"rgba(255,255,255,.22)", fontSize:11, marginTop:16 }}>
            İlk mesajı sen gönder 👋
          </div>
        )}
        {messages.map((m, i) => {
          const isMe = m.senderId === myUid;
          const msgKey = m.id || (m.senderId + "_" + (m.ts || i));
          return (
            <div key={msgKey} style={{ display:"flex", flexDirection:"column", alignItems: isMe ? "flex-end" : "flex-start" }}>
              {!isMe && <span style={{ fontSize:9, color:"rgba(255,255,255,.3)", marginBottom:2, paddingLeft:4 }}>{m.senderName}</span>}
              <div style={{
                maxWidth:"80%", padding:"6px 11px",
                borderRadius: isMe ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                background: isMe ? `linear-gradient(135deg,${CYAN}cc,${MAGENTA}cc)` : "rgba(255,255,255,.09)",
                fontSize:12, color:"#fff", lineHeight:1.45, wordBreak:"break-word",
                boxShadow: isMe ? `0 2px 10px rgba(0,200,224,.25)` : "none",
              }}>{m.text}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div style={{ display:"flex", gap:7, padding:"7px 10px 10px", borderTop:"1px solid rgba(255,255,255,.06)", flexShrink:0 }}>
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Mesaj yaz..."
          style={{
            flex:1, background:"rgba(255,255,255,.07)",
            border:"1px solid rgba(255,255,255,.1)",
            borderRadius:22, padding:"8px 14px",
            color:"#fff", fontSize:12, outline:"none",
          }}
        />
        <button onClick={submit} disabled={!text.trim()} style={{
          width:38, height:38, borderRadius:"50%", border:"none",
          background: text.trim() ? `linear-gradient(135deg,${CYAN},${MAGENTA})` : "rgba(255,255,255,.08)",
          cursor: text.trim() ? "pointer" : "default",
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Ekran Kaydı Toast ────────────────────────────────────────────────────────
function RecordingToast({ text }) {
  return (
    <div style={{
      position:"absolute", bottom:70, left:12, zIndex:90,
      background:"rgba(217,70,168,.18)", backdropFilter:"blur(16px)",
      border:`1px solid rgba(217,70,168,.4)`, borderRadius:10,
      padding:"7px 14px",
      animation:"toastSlide 4s ease-out forwards",
      pointerEvents:"none",
    }}>
      <span style={{ fontSize:11, color:"#fff", fontWeight:600 }}>⚠️ {text}</span>
    </div>
  );
}

const ICE_SERVERS = [
  { urls:"stun:stun.l.google.com:19302" },
  { urls:"stun:stun1.l.google.com:19302" },
  { urls:"stun:stun2.l.google.com:19302" },
  { urls:"stun:stun.services.mozilla.com" },
];

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export default function LiveStream({ roomId, isInitiator, partner, user, onEnd, onSkip }) {
  const localRef     = useRef(null);
  const remoteRef    = useRef(null);
  const peerRef      = useRef(null);
  const streamRef    = useRef(null);
  const unsubsRef    = useRef([]);
  const startRef     = useRef(Date.now());
  const connIdRef    = useRef("conn_" + Date.now() + "_" + Math.random().toString(36).slice(2));
  const chatInputRef = useRef(null);

  const [duration,      setDuration]      = useState(0);
  const [remoteReady,   setRemoteReady]   = useState(false);
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [emojis,        setEmojis]        = useState([]);
  const [showBanner,    setShowBanner]    = useState(false);
  const [quality,       setQuality]       = useState(null);
  const [chatOpen,      setChatOpen]      = useState(false);
  const [messages,      setMessages]      = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [isRecording,   setIsRecording]   = useState(false);
  const [recordToast,   setRecordToast]   = useState(null); // karşıdan gelen kayıt bildirimi
  const mediaRecRef    = useRef(null);
  const recordChunks   = useRef([]);

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

  // Chat dinle
  useEffect(() => {
    if (!roomId) return;
    let initialized = false;
    const unsub = listenChatMessages(roomId, (msg) => {
      if (!initialized) return;
      setMessages(p => [...p, msg]);
      if (msg.senderId !== user?.uid) {
        setChatOpen(prev => { if (!prev) setUnreadCount(c => c + 1); return prev; });
      }
    });
    const t = setTimeout(() => { initialized = true; }, 800);
    return () => { unsub?.(); clearTimeout(t); };
  }, [roomId, user?.uid]);

  useEffect(() => {
    if (chatOpen) { setUnreadCount(0); setTimeout(() => chatInputRef.current?.focus(), 100); }
  }, [chatOpen]);

  // Emoji dinle
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
    if (roomId) { try { await sendEmojiReaction(roomId, emoji); } catch {} }
  }, [roomId]);

  const removeEmoji = useCallback(id => {
    setEmojis(p => p.filter(e => e.id !== id));
  }, []);

  const handleSendChat = useCallback(async (text) => {
    const myName = user?.displayName || user?.adSoyad || user?.kullaniciAdi || user?.username || "Ben";
    setMessages(p => [...p, { senderId: user?.uid, senderName: myName, text, ts: Date.now() }]);
    try { await sendChatMessage(roomId, user?.uid, myName, text); } catch {}
  }, [roomId, user]);

  // Ekran kaydı
  const handleRecord = useCallback(async () => {
    if (isRecording) {
      // Durdur
      mediaRecRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      // Ekran kaydını başlat (tüm ekran)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:true });
      recordChunks.current = [];
      const rec = new MediaRecorder(displayStream, { mimeType:"video/webm;codecs=vp9" });
      rec.ondataavailable = e => { if (e.data.size > 0) recordChunks.current.push(e.data); };
      rec.onstop = () => {
        displayStream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordChunks.current, { type:"video/webm" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = `mylive-${Date.now()}.webm`; a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
      };
      displayStream.getVideoTracks()[0].onended = () => {
        rec.stop(); setIsRecording(false);
      };
      rec.start();
      mediaRecRef.current = rec;
      setIsRecording(true);
      // Karşıya bildirim gönder (emoji kanalını kullanıyoruz, özel event)
      if (roomId) {
        try { await sendEmojiReaction(roomId, "__recording__"); } catch {}
      }
    } catch (err) {
      console.error("[Record]", err);
    }
  }, [isRecording, roomId]);

  // Karşıdan kayıt bildirimi dinle
  useEffect(() => {
    if (!roomId) return;
    let initialized = false;
    const unsub = listenEmojiReactions(roomId, (data) => {
      if (!initialized) return;
      if (data.emoji === "__recording__") {
        const name = partner?.displayName || partner?.adSoyad || partner?.kullaniciAdi || "Karşı taraf";
        setRecordToast(`${name} ekran kaydı alıyor`);
        setTimeout(() => setRecordToast(null), 4500);
      }
    });
    const t = setTimeout(() => { initialized = true; }, 1200);
    return () => { unsub?.(); clearTimeout(t); };
  }, [roomId, partner]);

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
          position:"absolute", top:10, left:10, zIndex:10,
          display:"flex", alignItems:"center", gap:5,
          background:"rgba(0,0,0,.55)", backdropFilter:"blur(12px)",
          border:"1px solid rgba(255,255,255,.1)", borderRadius:18, padding:"4px 10px",
        }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:MAGENTA, display:"block",
            boxShadow:`0 0 5px ${MAGENTA}`, animation:"blink 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize:12, fontWeight:700, color:"#fff", letterSpacing:1, fontVariantNumeric:"tabular-nums" }}>
            {fmt(duration)}
          </span>
        </div>

        {/* Bağlantı kalitesi — sağ üst */}
        {remoteReady && quality && (
          <div style={{
            position:"absolute", top:10, right:10, zIndex:10,
            display:"flex", alignItems:"center", gap:4,
            background:"rgba(0,0,0,.55)", backdropFilter:"blur(12px)",
            border:`1px solid ${qColor}40`, borderRadius:18, padding:"4px 9px",
          }}>
            <div style={{ display:"flex", gap:2, alignItems:"flex-end" }}>
              {[1,2,3].map(b => (
                <div key={b} style={{ width:3, height:3+b*4, borderRadius:2,
                  background:(quality==="good"||(quality==="medium"&&b<=2)||(quality==="poor"&&b<=1)) ? qColor : "rgba(255,255,255,.2)" }} />
              ))}
            </div>
            <span style={{ fontSize:10, color:qColor, fontWeight:600 }}>
              {quality==="good"?"İyi":quality==="medium"?"Orta":"Zayıf"}
            </span>
          </div>
        )}

        {/* Bağlanıyor — sağ üst */}
        {!remoteReady && (
          <div style={{
            position:"absolute", top:10, right:10, zIndex:10,
            background:"rgba(0,0,0,.55)", backdropFilter:"blur(12px)",
            border:`1px solid rgba(0,200,224,.3)`, borderRadius:18, padding:"4px 10px",
            display:"flex", alignItems:"center", gap:5,
          }}>
            <div style={{ width:9, height:9, borderRadius:"50%",
              border:`2px solid ${CYAN}`, borderTopColor:"transparent", animation:"spin .8s linear infinite" }} />
            <span style={{ fontSize:10, color:CYAN, fontWeight:600 }}>Bağlanıyor</span>
          </div>
        )}

        {/* Partner isim — sol alt */}
        {remoteReady && (
          <div style={{
            position:"absolute", bottom:10, left:10, zIndex:10,
            display:"flex", alignItems:"center", gap:7,
            background:"rgba(0,0,0,.55)", backdropFilter:"blur(12px)",
            border:"1px solid rgba(255,255,255,.1)", borderRadius:22, padding:"5px 12px 5px 6px",
          }}>
            <div style={{ width:26, height:26, borderRadius:"50%",
              background:`linear-gradient(135deg,${CYAN},${MAGENTA})`,
              overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {partner?.photoURL
                ? <img src={partner.photoURL} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <span style={{ fontSize:13 }}>👤</span>}
            </div>
            <span style={{ fontSize:12, fontWeight:600, color:"#fff" }}>{partnerName}</span>
          </div>
        )}

        {/* Bağlantı kuruldu banner */}
        {showBanner && (
          <div style={{
            position:"absolute", bottom:10, left:"50%", transform:"translateX(-50%)", zIndex:15,
            background:"rgba(0,0,0,.75)", backdropFilter:"blur(16px)",
            border:`1px solid rgba(34,201,122,.35)`, borderRadius:10, padding:"7px 14px",
            display:"flex", alignItems:"center", gap:7, whiteSpace:"nowrap",
          }}>
            <span style={{ fontSize:12, color:"#22c97a", fontWeight:600 }}>✓ Bağlantı kuruldu</span>
            <span style={{ fontSize:12, color:"#fff" }}>{partnerName}</span>
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
        boxShadow:`0 0 10px rgba(0,200,224,.4)`,
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
            <span style={{ fontSize:38 }}>📷</span>
          </div>
        )}

        {/* ── LOGO WATERMARK — sol üst (bölme çizgisinin hemen altı) ── */}
        <div style={{
          position:"absolute", top:10, left:10, zIndex:10,
          display:"flex", alignItems:"center", gap:5,
          opacity:0.35, pointerEvents:"none",
        }}>
          <div style={{
            width:22, height:22, borderRadius:6,
            background:`linear-gradient(135deg,${CYAN},${MAGENTA})`,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <span style={{ fontSize:11, fontWeight:900, color:"#fff" }}>M</span>
          </div>
          <span style={{ fontSize:11, fontWeight:700, color:"#fff", letterSpacing:.5 }}>mylasa</span>
        </div>

        {/* ── EKRAN KAYDI — sağ üst (bölme çizgisinin hemen altı) ── */}
        <button
          onClick={handleRecord}
          title={isRecording ? "Kaydı Durdur" : "Ekran Kaydı Al"}
          style={{
            position:"absolute", top:10, right:10, zIndex:20,
            height:28, padding:"0 10px", borderRadius:14,
            border:`1px solid ${isRecording ? "rgba(255,71,87,.6)" : "rgba(255,255,255,.15)"}`,
            background: isRecording ? "rgba(255,71,87,.25)" : "rgba(12,12,22,.7)",
            backdropFilter:"blur(12px)",
            display:"flex", alignItems:"center", gap:5, cursor:"pointer",
            animation: isRecording ? "recordPulse 1.5s ease-in-out infinite" : "none",
          }}
        >
          <div style={{ width:7, height:7, borderRadius:"50%",
            background: isRecording ? "#ff4757" : "rgba(255,255,255,.4)",
            boxShadow: isRecording ? "0 0 6px #ff4757" : "none",
          }} />
          <span style={{ fontSize:10, fontWeight:600, color: isRecording ? "#ff4757" : "rgba(255,255,255,.6)" }}>
            {isRecording ? "KAYIT" : "REC"}
          </span>
        </button>

        {/* ── SOL SÜTUN — Chat, Emoji, Kamera/Mikrofon ── */}
        <div style={{
          position:"absolute", bottom:14, left:10, zIndex:50,
          display:"flex", flexDirection:"column", alignItems:"center", gap:9,
        }}>
          {/* Emoji fan */}
          <EmojiFan onSelect={sendEmoji} />

          {/* Chat */}
          <div style={{ position:"relative" }}>
            <OBtn
              onClick={() => setChatOpen(o => !o)}
              active={chatOpen}
              activeColor="0,200,224"
              title="Mesajlar"
              size={44}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke={chatOpen ? CYAN : unreadCount > 0 ? MAGENTA : "rgba(255,255,255,.7)"}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </OBtn>
            {unreadCount > 0 && !chatOpen && (
              <div style={{
                position:"absolute", top:-2, right:-2,
                width:16, height:16, borderRadius:"50%",
                background:MAGENTA, color:"#fff",
                fontSize:9, fontWeight:700,
                display:"flex", alignItems:"center", justifyContent:"center",
                border:"2px solid #050505",
              }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </div>
            )}
          </div>

          {/* Kamera/Mikrofon */}
          <MediaMenu micOn={micOn} camOn={camOn} onToggleMic={toggleMic} onToggleCam={toggleCam} />
        </div>

        {/* ── SAĞ SÜTUN — Geç (üst), Bitir (alt) ── */}
        <div style={{
          position:"absolute", bottom:14, right:10, zIndex:50,
          display:"flex", flexDirection:"column", alignItems:"center", gap:20,
        }}>
          {/* Geç — üstte */}
          <button onClick={handleSkip} style={{
            height:40, padding:"0 14px", borderRadius:22,
            border:`1.5px solid rgba(0,200,224,.4)`,
            background:"rgba(12,12,22,.78)", backdropFilter:"blur(16px)",
            color:CYAN, fontSize:12, fontWeight:700, cursor:"pointer",
            display:"flex", alignItems:"center", gap:5,
            boxShadow:`0 3px 14px rgba(0,200,224,.18)`,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
            Geç
          </button>

          {/* Bitir — altta */}
          <button onClick={handleEnd} style={{
            width:48, height:48, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"linear-gradient(135deg,#ff4757,#c0392b)",
            boxShadow:"0 4px 18px rgba(255,71,87,.5)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.11a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.17 0h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.15 7.91"/>
              <line x1="23" y1="1" x2="1" y2="23"/>
            </svg>
          </button>
        </div>

        {/* Kendi isim kaldırıldı — kullanıcının kendi adını görmesine gerek yok */}

        {/* ── Karşı taraf kayıt bildirimi toast ── */}
        {recordToast && <RecordingToast text={recordToast} />}

        {/* ── Chat Paneli ── */}
        {chatOpen && (
          <ChatPanel
            messages={messages}
            myUid={user?.uid}
            onSend={handleSendChat}
            onClose={() => setChatOpen(false)}
            inputRef={chatInputRef}
          />
        )}
      </div>

      <style>{`
        @keyframes blink       { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        @keyframes floatUp     { 0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(-160px) scale(1.3);opacity:0} }
        @keyframes fanIn       { 0%{transform:scale(.3) translateY(10px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes slideUp     { 0%{transform:translateY(100%);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes recordPulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes toastSlide  { 0%{transform:translateX(0);opacity:1} 80%{transform:translateX(0);opacity:1} 100%{transform:translateX(-30px);opacity:0} }
      `}</style>
    </div>
  );
}
