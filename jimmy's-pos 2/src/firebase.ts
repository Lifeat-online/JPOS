import { initializeApp, FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Define an interface for the custom firebaseConfig to ensure type safety
// This extends FirebaseOptions to include any custom properties
interface AppFirebaseConfig extends FirebaseOptions {
  firestoreDatabaseId?: string; // Optional custom field for Firestore database ID
}

// Initialize app with the standard FirebaseOptions
const app = initializeApp(firebaseConfig as FirebaseOptions);
export const auth = getAuth(app);
// Access firestoreDatabaseId using the custom interface for type safety
export const db = getFirestore(app, (firebaseConfig as AppFirebaseConfig).firestoreDatabaseId || '(default)');

enableMultiTabIndexedDbPersistence(db).catch((err: any) => { // Explicitly type err as any for consistency with original code, or define a more specific error type if known
  if (err.code === 'failed-precondition') {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
  } else if (err.code === 'unimplemented') {
      console.warn("The current browser does not support all of the features required to enable persistence");
  } else {
      console.error("Failed to enable Firebase persistence:", err); // Catch other unexpected errors
  }
});

async function testConnection() {
  try {
    // Attempt to fetch a dummy document to test connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connected successfully");
  } catch (error: any) {
    // More specific error message for offline scenarios
    if (error.message?.includes('the client is offline')) {
      console.error("Firebase connection error: The client is offline. Please check your network connection.");
    } else {
      // General error logging for other connection issues
      console.error("Firebase connection error: An unexpected error occurred during connection test.", error);
    }
  }
}
