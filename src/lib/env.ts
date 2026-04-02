const readEnv = (key: keyof ImportMetaEnv) => import.meta.env[key]?.trim() ?? "";

export const env = {
  firebaseApiKey: readEnv("VITE_FIREBASE_API_KEY"),
  firebaseAuthDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  firebaseProjectId: readEnv("VITE_FIREBASE_PROJECT_ID"),
  firebaseStorageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  firebaseMessagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  firebaseAppId: readEnv("VITE_FIREBASE_APP_ID"),
  useFirebaseEmulators: readEnv("VITE_USE_FIREBASE_EMULATORS") === "true",
};

export const isFirebaseConfigured = Object.values({
  apiKey: env.firebaseApiKey,
  authDomain: env.firebaseAuthDomain,
  projectId: env.firebaseProjectId,
  storageBucket: env.firebaseStorageBucket,
  messagingSenderId: env.firebaseMessagingSenderId,
  appId: env.firebaseAppId,
}).every(Boolean);
