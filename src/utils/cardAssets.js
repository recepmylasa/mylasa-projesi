// src/utils/cardAssets.js
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "../firebase";

/**
 * Firestore'daki asset alanını (http, /public veya Storage path) gerçek URL'e çevirir.
 * - http(s) => aynen döner
 * - "/..."  => public klasör (örn. /cards/_SILHOUETTE.jpg)
 * - "gs://bucket/path" veya "cards/S1/LOVE.jpg" => Firebase Storage
 */
export async function resolveCardAsset(asset) {
  if (!asset) return null;
  if (asset.startsWith("http")) return asset;
  if (asset.startsWith("/")) return asset;
  if (asset.startsWith("gs://")) {
    const path = asset.replace(/^gs:\/\/[^/]+\//, "");
    return await getDownloadURL(ref(storage, path));
  }
  // düz Storage yolu
  return await getDownloadURL(ref(storage, asset));
}

/** Güvenli görüntüleme için küçük bir yardımcı: yüklenemezse null döner */
export async function safeResolve(asset) {
  try {
    return await resolveCardAsset(asset);
  } catch (_e) {
    return null;
  }
}
