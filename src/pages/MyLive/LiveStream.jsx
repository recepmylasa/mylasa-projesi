// FILE: src/pages/MyLive/LiveStream.jsx
// Split-screen: üst=karşı, alt=kendi
// + emoji tepkileri, mikrofon/kamera toggle, bağlantı kalitesi
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createRoom, joinRoom, listenRoom, addIceCandidate as fsAddIce,
  listenIceCandidates, closeRoom, leaveQueue, saveConnection,
} from "../../services/myLiveService";

// ---- Karıncalı TV efekti ----
function StaticNoise() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    function draw() {
      const w = canvas.width || 320;
      const h = canvas.height || 240;
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 200 + 20) | 0;
        d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      rafRef.current = requestAnimationFrame(draw);
    }
    const resize = () => { canvas.width = canvas.offsetWidth || 320; canvas.height = canvas.offsetHeight || 240; };
    resize();
    draw();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", opacity: 0.82 }} />
      {/* Scan lines */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)",
      }} />
      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.6) 100%)",
      }} />
      {/* Yazı */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", pointerEvents: "none", gap: 8,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace", animation: "blink 1.4s step-end infinite" }}>
          ● SİNYAL BEKLENİYOR
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", letterSpacing: 1 }}>
          Eşleşme aranıyor...
        </div>
      </div>
    </div>
  );
}

// ---- Emoji tepkisi animasyonu ----
function FloatingEmoji({ emoji, id, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div key={id} style={{
      position: "absolute",
      bottom: "10%",
      left: `${20 + Math.random() * 60}%`,
      fontSize: 28,
      animation: "floatUp 2.2s ease-out forwards",
      pointerEvents: "none",
      zIndex: 30,
    }}>
      {emoji}
    </div>
  );
}

const EMOJIS = ["❤️", "😂", "😍", "🔥", "👏", "😮", "💯", "🎉"];
const CYAN = "#00c8e0";
const MAGENTA = "#d946a8";

export default function LiveStream({ roomId, isInitiator, partner, user, onEnd, onSkip }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [connState, setConnState] = useState("connecting");
  const [remoteReady, setRemoteReady] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [quality, setQuality] = useState(null); // "good" | "medium" | "poor"
  const connectionIdRef = useRef("conn_" + Date.now() + "_" + Math.random().toString(36).slice(2));
  const startTimeRef = useRef(Date.now());
  const unsubsRef = useRef([]);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const qualityTimerRef = useRef(null);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Bağlantı kalitesi ölçümü
  useEffect(() => {
    qualityTimerRef.current = setInterval(async () => {
      const pc = peerRef.current;
      if (!pc || pc.connectionState !== "connected") return;
      try {
        const stats = await pc.getStats();
        let rtt = null;
        stats.forEach((s) => {
          if (s.type === "candidate-pair" && s.state === "succeeded") {
            rtt = s.currentRoundTripTime;
          }
        });
        if (rtt !== null) {
          setQuality(rtt < 0.15 ? "good" : rtt < 0.4 ? "medium" : "poor");
        }
      } catch {}
    }, 4000);
    return () => clearInterval(qualityTimerRef.current);
  }, []);

  // WebRTC setup
  useEffect(() => {
    let mounted = true;
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.services.mozilla.com" },
      ],
    });
    peerRef.current = pc;

    pc.onconnectionstatechange = () => {
      if (!mounted) return;
      setConnState(pc.connectionState);
      if (pc.connectionState === "connected") setRemoteReady(true);
    };

    pc.ontrack = (event) => {
      if (!mounted) return;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setRemoteReady(true);
      }
    };

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            fsAddIce(roomId, isInitiator ? "caller" : "callee", event.candidate).catch(() => {});
          }
        };

        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await createRoom(roomId, { type: offer.type, sdp: offer.sdp });
          const unsub1 = listenRoom(roomId, async (data) => {
            if (data.answer && pc.signalingState === "have-local-offer") {
              try { await pc.setRemoteDescription(new RTCSessionDescription(data.answer)); } catch {}
            }
          });
          const unsub2 = listenIceCandidates(roomId, "callee", async (c) => {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          });
          unsubsRef.current = [unsub1, unsub2];
        } else {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("offer timeout")), 15000);
            const unsub = listenRoom(roomId, async (data) => {
              if (data && data.offer) { clearTimeout(timeout); unsub(); resolve(data); }
            });
          }).then(async (data) => {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await joinRoom(roomId, { type: answer.type, sdp: answer.sdp });
          });
          const unsub3 = listenIceCandidates(roomId, "caller", async (c) => {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          });
          unsubsRef.current = [unsub3];
        }
      } catch (err) {
        console.error("[LiveStream] setup error:", err);
      }
    }
    setup();
    return () => {
      mounted = false;
      unsubsRef.current.forEach((u) => u && u());
      if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); }
    };
  }, []); // eslint-disable-line

  const handleEnd = useCallback(async () => {
    const dur = Math.floor((Date.now() - startTimeRef.current) / 1000);
    unsubsRef.current.forEach((u) => u && u());
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    await closeRoom(roomId).catch(() => {});
    await leaveQueue(user?.uid).catch(() => {});
    await saveConnection({ connectionId: connectionIdRef.current, user1Id: user?.uid, user2Id: partner?.userId, roomId, duration: dur }).catch(() => {});
    onEnd?.({ connectionId: connectionIdRef.current, partner, duration: dur });
  }, [roomId, user, partner, onEnd]);

  const handleSkip = useCallback(async () => {
    unsubsRef.current.forEach((u) => u && u());
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    await closeRoom(roomId).catch(() => {});
    onSkip?.();
  }, [roomId, onSkip]);

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  }, []);

  const toggleCam = useCallback(() => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCamOn(track.enabled); }
  }, []);

  const sendEmoji = useCallback((emoji) => {
    setFloatingEmojis((prev) => [...prev, { emoji, id: Date.now() + Math.random() }]);
    setShowEmojiPicker(false);
  }, []);

  const removeEmoji = useCallback((id) => {
    setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const formatTime = (s) =>
    String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

  const qualityColor = quality === "good" ? "#22c97a" : quality === "medium" ? "#f59e0b" : quality === "poor" ? "#ff4757" : "rgba(255,255,255,0.3)";
  const qualityLabel = quality === "good" ? "İyi" : quality === "medium" ? "Orta" : quality === "poor" ? "Zayıf" : "";

  const partnerName = partner?.displayName || partner?.username || "Kullanıcı";
  const myName = user?.displayName?.split(" ")[0] || "Sen";

  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column",
      background: "#000",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflow: "hidden",
    }}>
      {/* ====== ÜST YARI — Karşı kullanıcı ====== */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#0a0a0a" }}>
        {!remoteReady && <StaticNoise />}
        <video
          ref={remoteVideoRef}
          autoPlay playsInline
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: remoteReady ? 1 : 0, transition: "opacity 0.5s ease",
          }}
        />

        {/* Timer - sol üst */}
        <div style={{
          position: "absolute", top: 14, left: 14,
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: "5px 12px",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: MAGENTA, display: "block", boxShadow: `0 0 6px ${MAGENTA}`, animation: "blink 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 1, fontVariantNumeric: "tabular-nums" }}>
            {formatTime(duration)}
          </span>
        </div>

        {/* Bağlantı kalitesi - sağ üst */}
        {remoteReady && quality && (
          <div style={{
            position: "absolute", top: 14, right: 14,
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)",
            border: `1px solid ${qualityColor}40`, borderRadius: 20, padding: "5px 10px",
          }}>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
              {[1, 2, 3].map((bar) => (
                <div key={bar} style={{
                  width: 4, height: 4 + bar * 4,
                  borderRadius: 2,
                  background: (quality === "good" || (quality === "medium" && bar <= 2) || (quality === "poor" && bar <= 1))
                    ? qualityColor : "rgba(255,255,255,0.2)",
                }} />
              ))}
            </div>
            <span style={{ fontSize: 11, color: qualityColor, fontWeight: 600 }}>{qualityLabel}</span>
          </div>
        )}

        {/* Bağlanıyor badge */}
        {!remoteReady && (
          <div style={{
            position: "absolute", top: 14, right: 14,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)",
            border: `1px solid rgba(0,200,224,0.3)`, borderRadius: 20, padding: "5px 12px",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${CYAN}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 11, color: CYAN, fontWeight: 600 }}>Bağlanıyor</span>
          </div>
        )}

        {/* Partner isim - sol alt */}
        {remoteReady && (
          <div style={{
            position: "absolute", bottom: 14, left: 14,
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: "6px 14px 6px 8px",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
              overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {partner?.photoURL
                ? <img src={partner.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 14 }}>👤</span>}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{partnerName}</span>
          </div>
        )}

        {/* Uçan emojiler */}
        {floatingEmojis.map((e) => (
          <FloatingEmoji key={e.id} emoji={e.emoji} id={e.id} onDone={() => removeEmoji(e.id)} />
        ))}
      </div>

      {/* ====== BÖLME ====== */}
      <div style={{
        height: 3, flexShrink: 0,
        background: `linear-gradient(90deg, transparent, ${CYAN}, ${MAGENTA}, ${CYAN}, transparent)`,
        boxShadow: `0 0 12px rgba(0,200,224,0.5)`,
      }} />

      {/* ====== ALT YARI — Kendi kameran ====== */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#050505" }}>
        <video
          ref={localVideoRef}
          autoPlay playsInline muted
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: camOn ? 1 : 0.15,
          }}
        />

        {/* Kamera kapalı overlay */}
        {!camOn && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
          }}>
            <div style={{ fontSize: 40 }}>📷</div>
          </div>
        )}

        {/* Kendi isim - sol alt */}
        <div style={{
          position: "absolute", bottom: 20, left: 14,
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: "6px 14px 6px 8px",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: `linear-gradient(135deg, ${MAGENTA}, ${CYAN})`,
            overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 14 }}>👤</span>}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{myName}</span>
          <span style={{ fontSize: 10, color: CYAN, fontWeight: 700, background: "rgba(0,200,224,0.15)", borderRadius: 8, padding: "2px 6px" }}>SEN</span>
        </div>

        {/* ====== KONTROL BUTONLARI — sağ alt ====== */}
        <div style={{
          position: "absolute", bottom: 16, right: 14,
          display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end",
        }}>
          {/* GEÇ */}
          <button onClick={handleSkip} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "9px 18px",
            borderRadius: 28, border: `1.5px solid rgba(0,200,224,0.4)`,
            background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)",
            color: CYAN, fontSize: 14, fontWeight: 700, cursor: "pointer",
            boxShadow: `0 4px 20px rgba(0,200,224,0.2)`,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
            </svg>
            Geç
          </button>

          {/* Alt sıra: mikrofon + kamera + emoji + bitir */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Mikrofon */}
            <button onClick={toggleMic} style={{
              width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
              background: micOn ? "rgba(0,0,0,0.6)" : "rgba(255,71,87,0.8)",
              backdropFilter: "blur(12px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              outline: micOn ? "1px solid rgba(255,255,255,0.15)" : "none",
              fontSize: 16,
            }} title={micOn ? "Mikrofonu Kapat" : "Mikrofonu Aç"}>
              {micOn ? "🎤" : "🔇"}
            </button>

            {/* Kamera */}
            <button onClick={toggleCam} style={{
              width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
              background: camOn ? "rgba(0,0,0,0.6)" : "rgba(255,71,87,0.8)",
              backdropFilter: "blur(12px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              outline: camOn ? "1px solid rgba(255,255,255,0.15)" : "none",
              fontSize: 16,
            }} title={camOn ? "Kamerayı Kapat" : "Kamerayı Aç"}>
              {camOn ? "📹" : "📷"}
            </button>

            {/* Emoji */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowEmojiPicker((p) => !p)} style={{
                width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                background: showEmojiPicker ? `rgba(0,200,224,0.3)` : "rgba(0,0,0,0.6)",
                backdropFilter: "blur(12px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                outline: "1px solid rgba(255,255,255,0.15)",
                fontSize: 18,
              }}>
                😊
              </button>
              {showEmojiPicker && (
                <div style={{
                  position: "absolute", bottom: 50, right: 0,
                  background: "rgba(10,10,20,0.92)", backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16,
                  padding: 10, display: "flex", flexWrap: "wrap", gap: 6, width: 160,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}>
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => sendEmoji(e)} style={{
                      width: 36, height: 36, borderRadius: 10, border: "none",
                      background: "rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 20,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.15s",
                    }}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* BİTİR */}
            <button onClick={handleEnd} style={{
              width: 44, height: 44, borderRadius: "50%", border: "none",
              background: "linear-gradient(135deg, #ff4757, #c0392b)",
              cursor: "pointer", boxShadow: "0 4px 20px rgba(255,71,87,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }} title="Bağlantıyı Kes">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.11a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.17 0h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.15 7.91" />
                <line x1="23" y1="1" x2="1" y2="23" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes floatUp {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-180px) scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
