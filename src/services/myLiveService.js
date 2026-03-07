// FILE: src/services/myLiveService.js
import { db } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  limit,
  serverTimestamp,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";

// ---- Kuyruk ----
export async function joinQueue(userId, filters = {}) {
  const ref = doc(db, "mylive_queue", userId);
  await setDoc(ref, {
    userId,
    filters,
    joinedAt: serverTimestamp(),
    status: "waiting",
    matchedWith: null,
    roomId: null,
  });
}

export async function leaveQueue(userId) {
  try { await deleteDoc(doc(db, "mylive_queue", userId)); } catch {}
}

export async function tryAtomicMatch(userId, filters = {}, blockedIds = []) {
  try {
    // ADIM 1 - transaction DISINDA getDocs
    const q = query(
      collection(db, "mylive_queue"),
      where("status", "==", "waiting"),
      limit(30)
    );
    const snap = await getDocs(q);

    const candidates = snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter((c) => c.id !== userId && !blockedIds.includes(c.id));

    if (candidates.length === 0) return null;

    // ADIM 2 - her aday icin transaction dene
    for (const cand of candidates) {
      try {
        const result = await runTransaction(db, async (tx) => {
          const myRef = doc(db, "mylive_queue", userId);
          const candRef = doc(db, "mylive_queue", cand.id);
          const mySnap = await tx.get(myRef);
          const candSnap = await tx.get(candRef);
          if (!mySnap.exists() || mySnap.data().status !== "waiting") return null;
          if (!candSnap.exists() || candSnap.data().status !== "waiting") return null;
          const roomId = "room_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
          tx.update(myRef, { status: "matched", matchedWith: cand.id, roomId, isInitiator: true });
          tx.update(candRef, { status: "matched", matchedWith: userId, roomId, isInitiator: false });
          return { roomId, isInitiator: true, partner: { userId: cand.id, ...candSnap.data() } };
        });
        if (result) return result;
      } catch (e) {
        console.warn("[match] tx retry:", e && e.message);
      }
    }
    return null;
  } catch (err) {
    console.error("[match] error:", err);
    return null;
  }
}

export function listenMyQueue(userId, callback) {
  return onSnapshot(doc(db, "mylive_queue", userId), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// ---- Signaling - alt koleksiyon kullan (rules: /mylive_rooms/{roomId}/{sub}/{doc}) ----
const signalRef = (roomId) => doc(db, "mylive_rooms", roomId, "signal", "main");

export async function createRoom(roomId, offer) {
  await setDoc(signalRef(roomId), {
    offer,
    answer: null,
    status: "waiting",
    createdAt: serverTimestamp(),
  });
}

export async function joinRoom(roomId, answer) {
  await updateDoc(signalRef(roomId), { answer, status: "connected" });
}

export function listenRoom(roomId, callback) {
  return onSnapshot(signalRef(roomId), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

export async function closeRoom(roomId) {
  try { await updateDoc(signalRef(roomId), { status: "closed" }); } catch {}
}

export async function addIceCandidate(roomId, role, candidate) {
  await addDoc(collection(db, "mylive_rooms", roomId, role + "_candidates"), {
    sdpMid: candidate.sdpMid || null,
    sdpMLineIndex: candidate.sdpMLineIndex != null ? candidate.sdpMLineIndex : null,
    candidate: candidate.candidate,
    ts: serverTimestamp(),
  });
}

export function listenIceCandidates(roomId, role, callback) {
  return onSnapshot(collection(db, "mylive_rooms", roomId, role + "_candidates"), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") callback(change.doc.data());
    });
  });
}

// ---- Emoji / Tepki ----
export async function sendEmojiReaction(roomId, emoji) {
  await addDoc(collection(db, "mylive_rooms", roomId, "reactions"), {
    emoji,
    ts: serverTimestamp(),
  });
}
export function listenEmojiReactions(roomId, callback) {
  return onSnapshot(collection(db, "mylive_rooms", roomId, "reactions"), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") callback(change.doc.data());
    });
  });
}

// ---- Baglanti gecmisi ----
export async function saveConnection(data) {
  await addDoc(collection(db, "mylive_connections"), { ...data, createdAt: serverTimestamp() });
}

export async function rateConnection(connectionId, userId, rating, review, blocked) {
  const ref = doc(db, "mylive_connections", connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const isUser1 = data.user1Id === userId;
  await updateDoc(ref, isUser1
    ? { user1Rating: rating, user1Review: review, user1Blocked: blocked }
    : { user2Rating: rating, user2Review: review, user2Blocked: blocked }
  );
}

// ---- Engelleme ----
export async function blockUser(blockerId, blockedId) {
  await setDoc(doc(db, "mylive_blocked", blockerId + "_" + blockedId), {
    blockerId, blockedId, createdAt: serverTimestamp(),
  });
}

export async function getBlockedUsers(userId) {
  const q = query(collection(db, "mylive_blocked"), where("blockerId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().blockedId);
}

// ---- Sikayet ----
export async function reportUser(reporterId, reportedId, reason, connectionId) {
  await addDoc(collection(db, "mylive_reports"), {
    reporterId, reportedId, reason, connectionId: connectionId || null,
    createdAt: serverTimestamp(),
  });
}

// ---- Profil ----
export async function getMyLiveProfile(userId) {
  const snap = await getDoc(doc(db, "mylive_profiles", userId));
  return snap.exists() ? snap.data() : null;
}

export async function saveMyLiveProfile(userId, data) {
  await setDoc(doc(db, "mylive_profiles", userId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

// ---- Istatistik ----
export async function getStats() {
  try {
    const q = query(collection(db, "mylive_queue"), where("status", "==", "waiting"));
    const snap = await getDocs(q);
    return { activeUsers: snap.size };
  } catch { return { activeUsers: 0 }; }
}
