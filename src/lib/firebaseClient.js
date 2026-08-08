import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "focusflow-9cd0f.firebaseapp.com",
  projectId: "focusflow-9cd0f",
  storageBucket: "focusflow-9cd0f.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { doc, getDoc, setDoc };