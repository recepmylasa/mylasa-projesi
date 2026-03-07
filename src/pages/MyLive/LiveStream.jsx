// FILE: src/pages/MyLive/LiveStream.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import "../../styles/myLive.css";
import { useWebRTC } from "../../hooks/useWebRTC";
import {
  createRoom, joinRoom, listenRoom, addIceCandidate,
  listenIceCandidates, closeRoom, leaveQueue, saveConnection,
} from "../../services/myLiveService";

export default function LiveStream({ roomId, isInitiator, partner, user, onEnd, onSkip }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [connectionState, setConnectionState] = useState("connecting");
  const connectionIdRef = useRef(`conn_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const startTimeRef = useRef(Date.now());
  const unsubscribersRef = useRef([]);

  const { localStream, remoteStream, getLocalStream, createOffer, createAnswer,
    setRemoteAnswer, addIceCandidate: addICE, onIceCandidate,
    toggleVideo, toggleAudio, isVideoEnabled, isAudioEnabled, cleanup } = useWebRTC({
    onConnectionStateChange: setConnectionState,
  });

  // Timer
  useEffect(() => {
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Local video
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // WebRTC setup
  useEffect(() => {
    let mounted = true;
    async function setup() {
      try {
        const stream = await getLocalStream();
        if (!mounted) return;

        if (isInitiator) {
          // ICE callback'i createOffer'DAN ONCE kur - candidate kaybi onlenir
          onIceCandidate((candidate) => addIceCandidate(roomId, "caller", candidate));
          const { peer, offer } = await createOffer(stream);
          await createRoom(roomId, offer);

          const unsub1 = listenRoom(roomId, async (data) => {
            if (data.answer && peer.signalingState === "have-local-offer") {
              try { await setRemoteAnswer(data.answer); } catch (e) { console.warn("[LiveStream] setRemoteAnswer:", e); }
            }
          });

          const unsub2 = listenIceCandidates(roomId, "callee", (c) => addICE(c));
          unsubscribersRef.current = [unsub1, unsub2];
        } else {
          // ICE callback'i createAnswer'DAN ONCE kur
          onIceCandidate((candidate) => addIceCandidate(roomId, "callee", candidate));
          const room = await new Promise((resolve) => {
            const unsub = listenRoom(roomId, (data) => {
              if (data.offer) { unsub(); resolve(data); }
            });
          });

          const { answer } = await createAnswer(stream, room.offer);
          await joinRoom(roomId, answer);

          const unsub3 = listenIceCandidates(roomId, "caller", (c) => addICE(c));
          unsubscribersRef.current = [unsub3];
        }
      } catch (err) {
        console.error("[LiveStream] setup error:", err);
      }
    }
    setup();
    return () => { mounted = false; };
  }, []); // eslint-disable-line

  // Remote video - remoteStream geldiginde bagla
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleEnd = useCallback(async () => {
    const dur = Math.floor((Date.now() - startTimeRef.current) / 1000);
    unsubscribersRef.current.forEach((u) => u?.());
    await closeRoom(roomId).catch(() => {});
    await leaveQueue(user?.uid).catch(() => {});
    await saveConnection({
      connectionId: connectionIdRef.current,
      user1Id: user?.uid,
      user2Id: partner?.userId,
      roomId,
      duration: dur,
    }).catch(() => {});
    cleanup();
    onEnd?.({ connectionId: connectionIdRef.current, partner, duration: dur });
  }, [roomId, user, partner, cleanup, onEnd]);

  const handleSkip = useCallback(async () => {
    unsubscribersRef.current.forEach((u) => u?.());
    await closeRoom(roomId).catch(() => {});
    cleanup();
    onSkip?.();
  }, [roomId, cleanup, onSkip]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="mylive-stream">
      {/* Remote video */}
      <video
        ref={remoteVideoRef}
        className="mylive-stream-remote"
        autoPlay
        playsInline
        style={{ background: connectionState !== "connected" ? "#111" : "#000" }}
      />

      {/* Bağlanıyor overlay */}
      {connectionState !== "connected" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", zIndex: 15,
          background: "rgba(0,0,0,0.7)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📡</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            {connectionState === "connecting" ? "Bağlanıyor..." : "Bağlantı Kuruluyor..."}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            Lütfen bekleyin
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

      {/* Self name */}
      <div className="mylive-self-info">
        <div className="mylive-self-name">
          {user?.displayName?.split(" ")[0] ?? "Sen"}
        </div>
      </div>

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
              {partner.displayName ?? partner.username ?? "Kullanıcı"}
            </div>
            {partner.avgRating > 0 && (
              <div className="mylive-partner-rating">
                {"⭐".repeat(Math.round(partner.avgRating))} {partner.avgRating.toFixed(1)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mylive-stream-controls">
        <button
          className={`mylive-ctrl-btn ${isAudioEnabled ? "active" : ""}`}
          onClick={toggleAudio}
          title={isAudioEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç"}
        >
          {isAudioEnabled ? "🎤" : "🔇"}
        </button>

        <button
          className={`mylive-ctrl-btn ${isVideoEnabled ? "active" : ""}`}
          onClick={toggleVideo}
          title={isVideoEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}
        >
          {isVideoEnabled ? "📹" : "📷"}
        </button>

        <button className="mylive-skip-btn" onClick={handleSkip}>
          Geç ›
        </button>

        <button className="mylive-ctrl-btn danger" onClick={handleEnd} title="Bağlantıyı Kes">
          📵
        </button>
      </div>
    </div>
  );
}
