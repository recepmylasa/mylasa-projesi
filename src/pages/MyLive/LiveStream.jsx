// FILE: src/pages/MyLive/LiveStream.jsx
// Yeni tasarım: Dikey 2'ye bölünmüş ekran
//   - Üst yarı: karşı kullanıcı (bağlı değilse karıncalı TV efekti)
//   - Alt yarı: kendi kameran
//   - Sağ alt: "Geç" butonu
//   - Sol üst: timer
//   - Orta bölme çizgisi: gradient divider
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createRoom, joinRoom, listenRoom, addIceCandidate as fsAddIce,
  listenIceCandidates, closeRoom, leaveQueue, saveConnection,
} from "../../services/myLiveService";

// ---- Karıncalı TV efekti (canvas) ----
function StaticNoise({ style }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 200 + 20 | 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      rafRef.current = requestAnimationFrame(draw);
    }

    // Canvas boyutunu parent'a göre ayarla
    const resize = () => {
      canvas.width = canvas.offsetWidth || 320;
      canvas.height = canvas.offsetHeight || 240;
    };
    resize();
    draw();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", ...style }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", opacity: 0.85 }}
      />
      {/* Scan lines overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)",
      }} />
      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
      }} />
      {/* "Sinyal Bekleniyor" yazısı */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", pointerEvents: "none",
      }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)",
          letterSpacing: 2, textTransform: "uppercase",
          textShadow: "0 0 8px rgba(0,200,224,0.6)",
          fontFamily: "monospace",
          animation: "blink 1.4s step-end infinite",
        }}>
          ● SİNYAL BEKLENİYOR
        </div>
        <div style={{
          fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6,
          fontFamily: "monospace", letterSpacing: 1,
        }}>
          Eşleşme aranıyor...
        </div>
      </div>
    </div>
  );
}

// ---- Ana bileşen ----
export default function LiveStream({ roomId, isInitiator, partner, user, onEnd, onSkip }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [connState, setConnState] = useState("connecting");
  const [remoteReady, setRemoteReady] = useState(false);
  const connectionIdRef = useRef("conn_" + Date.now() + "_" + Math.random().toString(36).slice(2));
  const startTimeRef = useRef(Date.now());
  const unsubsRef = useRef([]);
  const peerRef = useRef(null);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
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
      const remote = event.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remote;
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
    };
  }, []); // eslint-disable-line

  const handleEnd = useCallback(async () => {
    const dur = Math.floor((Date.now() - startTimeRef.current) / 1000);
    unsubsRef.current.forEach((u) => u && u());
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    await closeRoom(roomId).catch(() => {});
    await leaveQueue(user?.uid).catch(() => {});
    await saveConnection({
      connectionId: connectionIdRef.current,
      user1Id: user?.uid,
      user2Id: partner?.userId,
      roomId,
      duration: dur,
    }).catch(() => {});
    onEnd?.({ connectionId: connectionIdRef.current, partner, duration: dur });
  }, [roomId, user, partner, onEnd]);

  const handleSkip = useCallback(async () => {
    unsubsRef.current.forEach((u) => u && u());
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    await closeRoom(roomId).catch(() => {});
    onSkip?.();
  }, [roomId, onSkip]);

  const formatTime = (s) =>
    String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

  const CYAN = "#00c8e0";
  const MAGENTA = "#d946a8";

  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column",
      background: "#000",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflow: "hidden",
    }}>
      {/* ====== ÜST YARI — Karşı kullanıcı ====== */}
      <div style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "#0a0a0a",
      }}>
        {/* Karıncalı ekran (bağlı değilse) */}
        {!remoteReady && (
          <StaticNoise style={{ position: "absolute", inset: 0 }} />
        )}

        {/* Karşı video */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
            opacity: remoteReady ? 1 : 0,
            transition: "opacity 0.5s ease",
          }}
        />

        {/* Partner isim etiketi - sol alt */}
        {partner && remoteReady && (
          <div style={{
            position: "absolute", bottom: 14, left: 14,
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 24, padding: "6px 14px 6px 8px",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
              overflow: "hidden", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {partner.photoURL
                ? <img src={partner.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 14 }}>👤</span>}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
              {partner.displayName || partner.username || "Kullanıcı"}
            </span>
          </div>
        )}

        {/* Timer - sol üst */}
        <div style={{
          position: "absolute", top: 14, left: 14,
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 20, padding: "5px 12px",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: MAGENTA,
            display: "block",
            boxShadow: `0 0 6px ${MAGENTA}`,
            animation: "blink 1.2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 1, fontVariantNumeric: "tabular-nums" }}>
            {formatTime(duration)}
          </span>
        </div>

        {/* Bağlanıyor badge - sağ üst */}
        {!remoteReady && (
          <div style={{
            position: "absolute", top: 14, right: 14,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(12px)",
            border: `1px solid rgba(0,200,224,0.3)`,
            borderRadius: 20, padding: "5px 12px",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              border: `2px solid ${CYAN}`, borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ fontSize: 11, color: CYAN, fontWeight: 600, letterSpacing: 0.5 }}>
              Bağlanıyor
            </span>
          </div>
        )}
      </div>

      {/* ====== BÖLME ÇİZGİSİ ====== */}
      <div style={{
        height: 3, flexShrink: 0,
        background: `linear-gradient(90deg, transparent, ${CYAN}, ${MAGENTA}, ${CYAN}, transparent)`,
        boxShadow: `0 0 12px rgba(0,200,224,0.5)`,
      }} />

      {/* ====== ALT YARI — Kendi kameran ====== */}
      <div style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "#050505",
      }}>
        {/* Kendi video */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
          }}
        />

        {/* Kendi isim etiketi - sol alt */}
        <div style={{
          position: "absolute", bottom: 80, left: 14,
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 24, padding: "6px 14px 6px 8px",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: `linear-gradient(135deg, ${MAGENTA}, ${CYAN})`,
            overflow: "hidden", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 14 }}>👤</span>}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
            {user?.displayName?.split(" ")[0] || "Sen"}
          </span>
          <span style={{
            fontSize: 10, color: CYAN, fontWeight: 700,
            background: "rgba(0,200,224,0.15)", borderRadius: 8,
            padding: "2px 6px", marginLeft: 2,
          }}>SEN</span>
        </div>

        {/* ====== KONTROL BUTONLARI — sağ alt ====== */}
        <div style={{
          position: "absolute", bottom: 20, right: 16,
          display: "flex", flexDirection: "column", gap: 10,
          alignItems: "flex-end",
        }}>
          {/* GEÇ butonu */}
          <button
            onClick={handleSkip}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px",
              borderRadius: 28,
              border: `1.5px solid rgba(0,200,224,0.4)`,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(16px)",
              color: CYAN, fontSize: 14, fontWeight: 700,
              cursor: "pointer",
              boxShadow: `0 4px 20px rgba(0,200,224,0.2)`,
              transition: "all 0.2s",
              letterSpacing: 0.5,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
            Geç
          </button>

          {/* BİTİR butonu */}
          <button
            onClick={handleEnd}
            style={{
              width: 48, height: 48,
              borderRadius: "50%",
              border: "none",
              background: "linear-gradient(135deg, #ff4757, #c0392b)",
              color: "#fff", fontSize: 20,
              cursor: "pointer",
              boxShadow: "0 4px 20px rgba(255,71,87,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
            }}
            title="Bağlantıyı Kes"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.11a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.17 0h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.15 7.91" />
              <line x1="23" y1="1" x2="1" y2="23" />
            </svg>
          </button>
        </div>
      </div>

      {/* CSS animasyonları */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
