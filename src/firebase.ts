import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use the named database in production; emulator always uses (default)
const isEmulator = typeof window !== 'undefined' && window.location.hostname === 'localhost' &&
  (import.meta as any).env?.VITE_USE_EMULATOR === 'true';

export const db = isEmulator
  ? getFirestore(app)
  : getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');

if (isEmulator) {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  console.info('[Firebase] Using local emulators — Firestore :8080, Auth :9099');
} else {
  // Only enable persistence in production (emulator handles it differently)
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser does not support offline persistence.');
    }
  });
}
