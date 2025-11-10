// src/firebase.js — TAM DOSYA (doğru bucket)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAKNCsetEkPBBhBoeJTexyrYygL96vzMRo",
  authDomain: "mylasa-final.firebaseapp.com",
  projectId: "mylasa-final",
  storageBucket: "mylasa-final.firebasestorage.app", // ✅ gerçek bucket
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ Tek bucketı zorlayarak veriyoruz (karışmasın)
export const storage = getStorage(app, "gs://mylasa-final.firebasestorage.app");

export const functions = getFunctions(app, "europe-west3");
export default app;
