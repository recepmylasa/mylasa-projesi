// FILE: src/services/myLiveService.js
// MyLive Firebase Servisi - Eşleştirme, Signaling, Engelleme
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
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";

// ---- Kuyruk Yönetimi ----

export async function joinQueue(userId, filters = {}) {
  const ref = doc(db, "mylive_queue", userId);
  await setDoc(ref, {
    userId,
    filters,
    joinedAt: serverTimestamp(),
    status: "waiting",
  });
}

export async function leaveQueue(userId) {
  try {
    await deleteDoc(doc(db, "mylive_queue", userId));
  } catch {}
}

export async function findMatch(userId, filters = {}, blockedIds = []) {
  const q = query(
    collection(db, "mylive_queue"),
    where("status", "==", "waiting"),
    orderBy("joinedAt"),
    limit(20)
  );
  const snap = await getDocs(q);
  const candidates = snap.docs
    .map((d) => d.data())
    .filter((u) => {
      if (u.userId === userId) return false;
      if (blockedIds.includes(u.userId)) return false;
      // Cinsiyet filtresi
      if (filters.gender && filters.gender !== "all" && u.filters?.gender) {
        if (u.filters.gender !== filters.gender) return false;
      }
      return true;
    });
  return candidates.length > 0 ? candidates[0] : null;
}

// ---- Oda / Signaling ----

export async function createRoom(roomId, offer) {
  await setDoc(doc(db, "mylive_rooms", roomId), {
    offer,
    createdAt: serverTimestamp(),
    status: "waiting",
  });
}

export async function joinRoom(roomId, answer) {
  await updateDoc(doc(db, "mylive_rooms", roomId), {
    answer,
    status: "connected",
  });
}

export async function getRoom(roomId) {
  const snap = await getDoc(doc(db, "mylive_rooms", roomId));
  return snap.exists() ? snap.data() : null;
}

export function listenRoom(roomId, callback) {
  return onSnapshot(doc(db, "mylive_rooms", roomId), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

export async function addIceCandidate(roomId, role, candidate) {
  const colRef = collection(db, "mylive_rooms", roomId, `${role}_candidates`);
  await addDoc(colRef, { ...candidate, createdAt: serverTimestamp() });
}

export function listenIceCandidates(roomId, role, callback) {
  const colRef = collection(db, "mylive_rooms", roomId, `${role}_candidates`);
  return onSnapshot(colRef, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") callback(change.doc.data());
    });
  });
}

export async function closeRoom(roomId) {
  try {
    await updateDoc(doc(db, "mylive_rooms", roomId), { status: "closed" });
  } catch {}
}

// ---- Bağlantı Geçmişi ----

export async function saveConnection(data) {
  await addDoc(collection(db, "mylive_connections"), {
    ...data,
    createdAt: serverTimestamp(),
  });
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
  const id = `${blockerId}_${blockedId}`;
  await setDoc(doc(db, "mylive_blocked", id), {
    blockerId,
    blockedId,
    createdAt: serverTimestamp(),
  });
}

export async function getBlockedUsers(userId) {
  const q = query(
    collection(db, "mylive_blocked"),
    where("blockerId", "==", userId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().blockedId);
}

// ---- Şikayet ----

export async function reportUser(reporterId, reportedId, reason, connectionId) {
  await addDoc(collection(db, "mylive_reports"), {
    reporterId,
    reportedId,
    reason,
    connectionId: connectionId || null,
    createdAt: serverTimestamp(),
  });
}

// ---- İstatistikler ----

export async function getStats() {
  try {
    const q = query(collection(db, "mylive_queue"), where("status", "==", "waiting"));
    const snap = await getDocs(q);
    return { activeUsers: snap.size };
  } catch {
    return { activeUsers: 0 };
  }
}

// ---- Kullanıcı Profili (MyLive) ----

export async function getMyLiveProfile(userId) {
  const snap = await getDoc(doc(db, "mylive_profiles", userId));
  return snap.exists() ? snap.data() : null;
}

export async function saveMyLiveProfile(userId, data) {
  await setDoc(doc(db, "mylive_profiles", userId), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
