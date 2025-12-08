
// firebase-config.js
// Save this file in the same folder as your HTML files.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCVz6gKcUwGi2T-OUPqZVjGOO5974Ni_PQ",
  authDomain: "learnbridge-c600a.firebaseapp.com",
  projectId: "learnbridge-c600a",
  storageBucket: "learnbridge-c600a.firebasestorage.app",
  messagingSenderId: "984788967908",
  appId: "1:984788967908:web:449e539ef2d5d9c117a7f1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
