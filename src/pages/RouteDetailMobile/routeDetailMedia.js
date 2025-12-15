// src/pages/RouteDetailMobile/routeDetailMedia.js
import { auth, db, storage } from "../../firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  addDoc,
  collection,
  getDocs,
  limit as qlimit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

function sanitizeName(name = "") {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 120);
}

function readImageDims(fileOrBlob) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        URL.revokeObjectURL(url);
        resolve({ w, h });
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        resolve({ w: 0, h: 0 });
      };
      img.src = url;
    } catch {
      resolve({ w: 0, h: 0 });
    }
  });
}

function readVideoDims(fileOrBlob) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(fileOrBlob);
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.onloadedmetadata = () => {
        const w = Number(vid.videoWidth) || 0;
        const h = Number(vid.videoHeight) || 0;
        URL.revokeObjectURL(url);
        resolve({ w, h });
      };
      vid.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        resolve({ w: 0, h: 0 });
      };
      vid.src = url;
    } catch {
      resolve({ w: 0, h: 0 });
    }
  });
}

export async function uploadStopMediaInline({
  routeId,
  stopId,
  file,
  onProgress,
  signal,
}) {
  if (!routeId || !stopId || !file) throw new Error("Eksik parametre");
  const u = auth.currentUser;
  if (!u?.uid) throw new Error("Kullanıcı yok");

  const isImage = /^image\//i.test(file.type);
  const isVideo = /^video\//i.test(file.type);
  if (!isImage && !isVideo) throw new Error("Sadece image/* veya video/*");

  let toUpload = file;
  let dims = { w: 0, h: 0 };

  if (isImage) {
    try {
      const mod = await import("browser-image-compression");
      toUpload = await mod.default(file, {
        maxWidthOrHeight: 1920,
        initialQuality: 0.85,
        maxSizeMB: 8,
        useWebWorker: true,
      });
    } catch {}
    dims = await readImageDims(toUpload);
  } else {
    dims = await readVideoDims(toUpload);
  }

  const ts = Date.now();
  const path = `route_media/${routeId}/${stopId}/${ts}-${sanitizeName(
    file.name || (isImage ? "image.jpg" : "video.mp4")
  )}`;

  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, toUpload, {
    contentType: toUpload.type || file.type,
  });

  if (signal) {
    const onAbort = () => {
      try {
        task.cancel();
      } catch {}
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const url = await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        const p = snap.totalBytes
          ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          : 0;
        if (onProgress) onProgress(p);
      },
      (err) => reject(err),
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (e) {
          reject(e);
        }
      }
    );
  });

  const mediaCol = collection(db, "routes", routeId, "stops", stopId, "media");
  const payload = {
    type: isImage ? "image" : "video",
    url,
    w: Number(dims.w) || 0,
    h: Number(dims.h) || 0,
    size: Number(toUpload.size || file.size) || 0,
    ownerId: u.uid,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(mediaCol, payload);
  return { id: docRef.id, ...payload, url };
}

export async function listStopMediaInline({ routeId, stopId, limit = 50 }) {
  const mediaCol = collection(db, "routes", routeId, "stops", stopId, "media");
  const q = query(
    mediaCol,
    orderBy("createdAt", "desc"),
    qlimit(Math.max(1, Math.min(limit, 200)))
  );

  try {
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    return { items: out, error: null };
  } catch (e) {
    const code = String(e?.code || e?.message || "");
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[media:list] hata:", code);
    }
    return { items: [], error: code || "unknown" };
  }
}
