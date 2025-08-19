// src/savesClient.js
import { db, auth } from './firebase';
import {
  doc, getDoc, setDoc, deleteDoc, serverTimestamp,
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
  type = 'post',          // 'post' | 'clip' | 'story' (ilerisi için)
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
