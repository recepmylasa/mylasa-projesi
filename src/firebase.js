import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Bu bilgiler, "Mylasa Final" projesine aittir.
const firebaseConfig = {
  apiKey: "AIzaSyAKNCsetEkPBBhBoeJTexyrYygL96vzMRo",
  authDomain: "mylasa-final.firebaseapp.com",
  projectId: "mylasa-final",
  storageBucket: "mylasa-final.firebasestorage.app", // not: console'daki değer buysa değiştirmiyoruz
  messagingSenderId: "574275313737",
  appId: "1:574275313737:web:2aff934186382ae8099f98",
};

const app = initializeApp(firebaseConfig);

// Exportlar
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ⚠️ Client Functions (Cloud Functions çağrıları için)
// Functions bölgesini backend ile aynı yapıyoruz: europe-west3
export const functions = getFunctions(app, "europe-west3");
