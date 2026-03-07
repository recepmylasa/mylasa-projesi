// FILE: src/pages/MyLive/LiveStream.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import "../../styles/myLive.css";
import { useWebRTC } from "../../hooks/useWebRTC";
import {
  createRoom, joinRoom, listenRoom, addIceCandidate as fsAddIce,
  listenIceCandidates, closeRoom, leaveQueue, saveConnection,
} from "../../services/myLiveService";

export default function LiveStream({ roomId, isInitiator, partner, user, onEnd, onSkip }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [connState, setConnState] = useState("connecting");
  const connectionIdRef = useRef("conn_" + Date.now() + "_" + Math.random().toString(36).slice(2));
  const startTimeRef = useRef(Date.now());
  const unsubsRef = useRef([]);
  const peerRef = useRef(null);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // WebRTC setup - tüm mantık burada, hook sadece yardımcı
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
    };

    pc.ontrack = (event) => {
      if (!mounted) return;
      const remote = event.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remote;
      }
    };

    async function setup() {
      try {
        // Kamera/mikrofon al
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }

        // Local video
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Track ekle
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // ICE candidate handler - setLocalDescription'dan ÖNCE kur
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            fsAddIce(roomId, isInitiator ? "caller" : "callee", event.candidate).catch(() => {});
          }
        };

        if (isInitiator) {
          // --- INITIATOR (caller) ---
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await createRoom(roomId, { type: offer.type, sdp: offer.sdp });

          // Answer dinle
          const unsub1 = listenRoom(roomId, async (data) => {
            if (data.answer && pc.signalingState === "have-local-offer") {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
              } catch (e) {
                console.warn("[LiveStream] setRemoteAnswer:", e);
              }
            }
          });

          // Callee ICE candidates dinle
          const unsub2 = listenIceCandidates(roomId, "callee", async (c) => {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (e) {
              console.warn("[LiveStream] addIce callee:", e);
            }
          });

          unsubsRef.current = [unsub1, unsub2];
        } else {
          // --- CALLEE ---
          // Offer'ı bekle
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("offer timeout")), 15000);
            const unsub = listenRoom(roomId, async (data) => {
              if (data && data.offer) {
                clearTimeout(timeout);
                unsub();
                resolve(data);
              }
            });
          }).then(async (data) => {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await joinRoom(roomId, { type: answer.type, sdp: answer.sdp });
          });

          // Caller ICE candidates dinle
          const unsub3 = listenIceCandidates(roomId, "caller", async (c) => {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (e) {
              console.warn("[LiveStream] addIce caller:", e);
            }
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
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const isConnected = connState === "connected";

  return (
    <div className="mylive-stream">
      {/* Remote video */}
      <video
        ref={remoteVideoRef}
        className="mylive-stream-remote"
        autoPlay
        playsInline
        style={{ background: isConnected ? "#000" : "#111" }}
      />

      {/* Bağlanıyor overlay */}
      {!isConnected && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", zIndex: 15,
          background: "rgba(0,0,0,0.75)",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "3px solid #00c8e0", borderTopColor: "transparent",
            animation: "spin 0.9s linear infinite", marginBottom: 16,
          }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
            Bağlantı Kuruluyor...
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            {connState}
          </div>
        </div>
      )}

      {/* Local video (PiP) */}
      <video
        ref={localVideoRef}
        className="mylive-stream-local"
        autoPlay
        playsInline
        muted
      />

      {/* Timer */}
      <div className="mylive-timer">
        <div className="mylive-timer-dot" />
        {formatTime(duration)}
      </div>

      {/* Partner info */}
      {partner && (
        <div className="mylive-partner-info">
          <div className="mylive-partner-avatar">
            {partner.photoURL
              ? <img src={partner.photoURL} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
              : "👤"}
          </div>
          <div>
            <div className="mylive-partner-name">
              {partner.displayName || partner.username || "Kullanıcı"}
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mylive-stream-controls">
        <button className="mylive-ctrl-btn" onClick={handleSkip} title="Geç">
          ⏭
        </button>
        <button className="mylive-ctrl-btn danger" onClick={handleEnd} title="Bitir">
          📵
        </button>
      </div>
    </div>
  );
}
