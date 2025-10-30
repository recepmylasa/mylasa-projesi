// src/services/relationships.js
// Takip servisleri. Öncelik: users/{targetUid}/followers/{meUid}
// Eski kurallar kullanılıyorsa kök /follows/{me_followee} dokümanını da yazar/izler.

import { auth, db } from "../firebase";
import {
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

function requireUser() {
  const u = auth.currentUser;
  if (!u) throw new Error("AUTH_REQUIRED");
  return u;
}

function followerRef(targetUid, followerUid) {
  return doc(db, "users", String(targetUid), "followers", String(followerUid));
}
function followsRootRef(followerUid, followeeUid) {
  return doc(db, "follows", `${followerUid}_${followeeUid}`);
}

export async function follow(targetUid) {
  const me = requireUser();
  if (!targetUid) throw new Error("TARGET_REQUIRED");
  if (me.uid === targetUid) throw new Error("SELF_FOLLOW_FORBIDDEN");

  // Öncelik: users/{target}/followers/{me}
  try {
    await setDoc(followerRef(targetUid, me.uid), {
      followerId: me.uid,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // Eski kurallar için kök /follows fallback
    await setDoc(followsRootRef(me.uid, targetUid), {
      followerId: me.uid,
      followeeId: targetUid,
      createdAt: serverTimestamp(),
    });
  }
  return true;
}

export async function unfollow(targetUid) {
  const me = requireUser();
  if (!targetUid) throw new Error("TARGET_REQUIRED");

  try {
    await deleteDoc(followerRef(targetUid, me.uid));
  } catch {
    // sessiz geç
  }
  try {
    await deleteDoc(followsRootRef(me.uid, targetUid));
  } catch {
    // sessiz geç
  }
  return true;
}

export async function getIsFollowingOnce(targetUid) {
  const me = requireUser();
  if (!targetUid || me.uid === targetUid) return false;

  const a = await getDoc(followerRef(targetUid, me.uid));
  if (a.exists()) return true;

  const b = await getDoc(followsRootRef(me.uid, targetUid));
  return b.exists();
}

/** Takip durumunu canlı izle (her iki model) */
export function watchIsFollowing(targetUid, cb) {
  const me = auth.currentUser;
  if (!me || !targetUid || me.uid === targetUid) {
    cb(false);
    return () => {};
  }
  const unsubscribers = [];

  // users/{target}/followers/{me}
  try {
    unsubscribers.push(
      onSnapshot(
        followerRef(targetUid, me.uid),
        (snap) => cb(snap.exists()),
        () => {}
      )
    );
  } catch {}

  // kök /follows/{me_target}
  try {
    unsubscribers.push(
      onSnapshot(
        followsRootRef(me.uid, targetUid),
        (snap) => cb(snap.exists()),
        () => {}
      )
    );
  } catch {}

  return () => unsubscribers.forEach((u) => u && u());
}

/** Sayaçları users/{uid} dokümanından izle */
export function watchCounts(userUid, cb) {
  if (!userUid) return () => {};
  const userDoc = doc(db, "users", String(userUid));
  return onSnapshot(
    userDoc,
    (snap) => {
      const d = snap.data() || {};
      cb({
        followersCount: Number(d.followersCount || 0),
        followingCount: Number(d.followingCount || 0),
      });
    },
    () => cb({ followersCount: 0, followingCount: 0 })
  );
}

export function mapError(e) {
  const code = String(e?.message || e?.code || e || "ERR");
  if (code.includes("AUTH_REQUIRED")) return "Giriş yapmalısın.";
  if (code.includes("SELF_FOLLOW_FORBIDDEN")) return "Kendini takip edemezsin.";
  if (code.includes("permission-denied")) return "İzin reddedildi.";
  return "İşlem başarısız. Lütfen tekrar dene.";
}
