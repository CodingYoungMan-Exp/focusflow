import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
apiKey: "AIzaSyAk-kVVZl-dKKPOyHtKzK4fcfBarAhogKA",
  authDomain: "focusflow-9cd0f.firebaseapp.com",
  databaseURL: "https://focusflow-9cd0f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "focusflow-9cd0f",
  storageBucket: "focusflow-9cd0f.firebasestorage.app",
  messagingSenderId: "605059562557",
  appId: "1:605059562557:web:8fbf999894c3c648957e54",
  measurementId: "G-ZQX9MEV4KJ"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { doc, getDoc, setDoc };