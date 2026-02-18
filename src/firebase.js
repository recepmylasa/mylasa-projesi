// FILE: src/firebase.js — STABİL (login + upload çalışır)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAKNCsetEkPBBhBoeJTexyrYygL96vzMRo",
  authDomain: "mylasa-final.firebaseapp.com",
  projectId: "mylasa-final",
  storageBucket: "mylasa-final.firebasestorage.app", // ✅ CORS derdi yok
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ DEV'de Firestore internal console spam'ini kapat (permission-denied "Uncaught..." dahil)
if (process.env.NODE_ENV !== "production") {
  try {
    // default: silent (console temiz)
    setLogLevel("silent");
  } catch {
    // no-op
  }
}

// ✅ Tek ve doğru bucket (explicit veriyoruz)
export const storage = getStorage(app, "gs://mylasa-final.firebasestorage.app");

// Not: UI’nın çağırdığı eski callable’lar europe-west3’teydi.
// Burayı değiştirmiyoruz ki mevcut akış bozulmasın.
export const functions = getFunctions(app, "europe-west3");

export default app;
