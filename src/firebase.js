// src/firebase.js — TAM DOSYA
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAKNCsetEkPBBhBoeJTexyrYygL96vzMRo",
  authDomain: "mylasa-final.firebaseapp.com",
  projectId: "mylasa-final",
<<<<<<< HEAD
  storageBucket: "mylasa-final.firebasestorage.app",   // ✅ DOĞRU
=======
  // 🔧 DÜZELTME: Storage bucket formatı appspot.com olmalı
  storageBucket: "mylasa-final.appspot.com",
>>>>>>> 5a891a633ae93877d7f4e09c013ab1953f527752
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
<<<<<<< HEAD
export const storage = getStorage(app, "gs://mylasa-final.firebasestorage.app"); // ✅ DOĞRU
=======
// Explicit bucket ile güvence
export const storage = getStorage(app, "gs://mylasa-final.appspot.com");
>>>>>>> 5a891a633ae93877d7f4e09c013ab1953f527752
export const functions = getFunctions(app, "europe-west3");
export default app;
