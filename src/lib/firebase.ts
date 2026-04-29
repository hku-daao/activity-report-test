import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  )
}

/** When set, the client can use Firebase Storage (e.g. attachments). */
export function isFirebaseStorageBucketConfigured(): boolean {
  return Boolean(
    isFirebaseConfigured() && String(firebaseConfig.storageBucket || '').trim(),
  )
}

let app: FirebaseApp | undefined
let auth: Auth | undefined
let storage: FirebaseStorage | undefined

if (isFirebaseConfigured()) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  if (isFirebaseStorageBucketConfigured() && app) {
    storage = getStorage(app)
  }
}

export { auth, storage, app as firebaseApp }
