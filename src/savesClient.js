// src/savesClient.js
import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from 'firebase/firestore';

/** Belirli bir içeriğin kaydedilip kaydedilmediğini getirir. */
export async function isSaved(contentId) {
  const user = auth.currentUser;
  if (!user || !contentId) return false;
  const ref = doc(db, `users/${user.uid}/saved/${contentId}`);
  const snap = await getDoc(ref);
  return snap.exists();
}

/** Toggle: kayıtlıysa siler; değilse kaydeder. Basit metadata da bırakıyoruz. */
export async function toggleSave({
  contentId,
  type = 'post',          // 'post' | 'clip' | 'story'
  authorId,
  mediaUrl,
  caption,
}) {
  const user = auth.currentUser;
  if (!user || !contentId) return { saved: false };

  const ref = doc(db, `users/${user.uid}/saved/${contentId}`);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await deleteDoc(ref);
    return { saved: false };
  }

  await setDoc(ref, {
    contentId,
    type,
    authorId: authorId || null,
    mediaUrl: mediaUrl || null,
    caption: caption || '',
    createdAt: serverTimestamp(),
  });
  return { saved: true };
}

/** Kaydedilenleri getirir (sayfalı). Sadece kendi hesabın için çalışır. */
export async function listSaved({ pageSize = 18, cursor = null } = {}) {
  const user = auth.currentUser;
  if (!user) return { items: [], nextCursor: null };

  const col = collection(db, 'users', user.uid, 'saved');
  const parts = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (cursor) parts.push(startAfter(cursor));
  const q = query(col, ...parts);

  const snap = await getDocs(q);
  const docs = snap.docs;

  const items = docs.map((d) => {
    const x = d.data() || {};
    // contentId = doc id
    return {
      contentId: d.id,
      type: x.type || 'post',
      mediaUrl: x.mediaUrl || null,
      caption: x.caption || '',
      authorId: x.authorId || null,
      createdAt: x.createdAt || null,
    };
  });

  const nextCursor = docs.length === pageSize ? docs[docs.length - 1] : null;
  return { items, nextCursor };
}
