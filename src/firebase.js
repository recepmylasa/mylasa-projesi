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
  // 🔧 DÜZELTME: Storage bucket formatı appspot.com olmalı
  storageBucket: "mylasa-final.appspot.com",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
// Explicit bucket ile güvence
export const storage = getStorage(app, "gs://mylasa-final.appspot.com");
export const functions = getFunctions(app, "europe-west3");
