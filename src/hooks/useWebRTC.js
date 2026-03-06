// FILE: src/hooks/useWebRTC.js
import { useRef, useState, useCallback, useEffect } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export function useWebRTC({ onRemoteStream, onConnectionStateChange }) {
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState("new");

  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error("[WebRTC] getUserMedia error:", err);
      throw err;
    }
  }, []);

  const createPeer = useCallback((stream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.ontrack = (event) => {
      const remote = event.streams[0];
      setRemoteStream(remote);
      onRemoteStream?.(remote);
    };

    peer.onconnectionstatechange = () => {
      setConnectionState(peer.connectionState);
      onConnectionStateChange?.(peer.connectionState);
    };

    peerRef.current = peer;
    return peer;
  }, [onRemoteStream, onConnectionStateChange]);

  const createOffer = useCallback(async (stream) => {
    const peer = createPeer(stream);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    return { peer, offer };
  }, [createPeer]);

  const createAnswer = useCallback(async (stream, offerSdp) => {
    const peer = createPeer(stream);
    await peer.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    return { peer, answer };
  }, [createPeer]);

  const setRemoteAnswer = useCallback(async (answerSdp) => {
    if (!peerRef.current) return;
    await peerRef.current.setRemoteDescription(new RTCSessionDescription(answerSdp));
  }, []);

  const addIceCandidate = useCallback(async (candidate) => {
    if (!peerRef.current) return;
    try {
      await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("[WebRTC] ICE candidate error:", err);
    }
  }, []);

  const onIceCandidate = useCallback((callback) => {
    if (!peerRef.current) return;
    peerRef.current.onicecandidate = (event) => {
      if (event.candidate) callback(event.candidate);
    };
  }, []);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
    }
  }, []);

  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState("closed");
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    localStream,
    remoteStream,
    isVideoEnabled,
    isAudioEnabled,
    connectionState,
    getLocalStream,
    createOffer,
    createAnswer,
    setRemoteAnswer,
    addIceCandidate,
    onIceCandidate,
    toggleVideo,
    toggleAudio,
    cleanup,
  };
}
