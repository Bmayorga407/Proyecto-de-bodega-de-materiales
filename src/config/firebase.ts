import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCYksC-Cpd1GZjfbGKqBbrSF3kMslL-Xxg",
    authDomain: "cocacola-bodega.firebaseapp.com",
    projectId: "cocacola-bodega",
    storageBucket: "cocacola-bodega.firebasestorage.app",
    messagingSenderId: "2403423628",
    appId: "1:2403423628:web:5583935ccca85d88a5b2a9",
    measurementId: "G-48JGVQV8QW"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
