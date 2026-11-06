import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import type { User } from 'firebase/auth';

// Firebase configuration from project details
const firebaseConfig = {
  apiKey: 'AIzaSyCH-xFWN9Su5pRZYUX3J6wVL80pemuT2qU',
  authDomain: 'codzer.firebaseapp.com',
  projectId: 'codzer',
  storageBucket: 'codzer.firebasestorage.app',
  messagingSenderId: '810716662584',
  appId: '1:810716662584:web:523c59beac459529818fcd',
  measurementId: 'G-6J5XD2ELK1',
};

/** Lazily constructed Firebase references — browser only. */
let auth: import('firebase/auth').Auth | null = null;
let firestore: import('firebase/firestore').Firestore | null = null;
let storage: import('firebase/storage').FirebaseStorage | null = null;
let initializing: Promise<void> | null = null;

/**
 * Import and initialize Firebase exactly once, in the browser.
 * On the server this resolves immediately without touching the SDK,
 * so server-side rendering never loads Firebase.
 */
function ensureFirebase(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (initializing) return initializing;

  initializing = (async () => {
    const [{ initializeApp }, { getAuth }, { getFirestore }, { getStorage }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
      import('firebase/storage'),
    ]);

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    firestore = getFirestore(app);
    storage = getStorage(app);

    // Setup confirmation — Firebase has no ping(), but reading the auth state
    // immediately below proves the project config and SDK are reachable.
    console.log('Firebase SDK initialized', firebaseConfig.projectId);

    // Listen to auth state changes and keep the store in sync.
    const { onAuthStateChanged } = await import('firebase/auth');
    onAuthStateChanged(auth, (user) => {
      store.set({ status: user ? 'authenticated' : 'anonymous', user });
    });
  })();

  return initializing;
}

/** Auth store shape. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
}

const store = atom<AuthState>({ status: 'loading', user: null });

/** Initializes Firebase (browser only) and returns the Auth instance. */
export async function getFirebaseAuth(): Promise<import('firebase/auth').Auth> {
  await ensureFirebase();

  if (!auth) {
    throw new Error('Firebase authentication is not available on this device.');
  }

  return auth;
}

/** Initializes Firebase (browser only) and returns the Firestore instance. */
export async function getFirebaseFirestore(): Promise<import('firebase/firestore').Firestore> {
  await ensureFirebase();

  if (!firestore) {
    throw new Error('Cloud Firestore is not available on this device.');
  }

  return firestore;
}

/** Initializes Firebase (browser only) and returns the Storage instance. */
export async function getFirebaseStorage(): Promise<import('firebase/storage').FirebaseStorage> {
  await ensureFirebase();

  if (!storage) {
    throw new Error('Firebase Storage is not available on this device.');
  }

  return storage;
}

/** Reads the real session (if any) and publishes it to the auth store. */
export async function refreshAuth(): Promise<AuthState> {
  await ensureFirebase();
  return store.get();
}

/** Creates a real Firebase account, then opens a real session for it. */
export async function signUp({ email, password, name }: { email: string; password: string; name: string }): Promise<User> {
  await ensureFirebase();
  if (!auth) throw new Error('Firebase not initialized');

  const { createUserWithEmailAndPassword } = await import('firebase/auth');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  // Store the display name in Firestore (client-side only, no server key needed).
  if (firestore) {
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(
      doc(firestore, 'users', user.uid),
      { uid: user.uid, email: user.email, displayName: name, createdAt: new Date().toISOString() },
      { merge: true },
    );
  }

  store.set({ status: 'authenticated', user });
  return user;
}

/** Opens a real Firebase session for an existing account. */
export async function signIn(email: string, password: string): Promise<User> {
  await ensureFirebase();
  if (!auth) throw new Error('Firebase not initialized');

  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  store.set({ status: 'authenticated', user });
  return user;
}

/** Invalidates the current Firebase session. */
export async function signOut(): Promise<void> {
  await ensureFirebase();
  if (auth) {
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  }
  store.set({ status: 'anonymous', user: null });
}

/** Starts password recovery — sends a reset email to the user. */
export async function sendRecoveryEmail(email: string): Promise<void> {
  await ensureFirebase();
  if (!auth) throw new Error('Firebase not initialized');

  const { sendPasswordResetEmail } = await import('firebase/auth');
  // The link lands on our own /reset-password route (with ?oobCode=…),
  // matching the app's real routing.
  const actionCodeSettings = { url: `${window.location.origin}/reset-password` };
  await sendPasswordResetEmail(auth, email, actionCodeSettings);
}

/** Completes password recovery from the emailed link. */
export async function resetPassword(params: { oobCode: string; password: string }): Promise<void> {
  await ensureFirebase();
  if (!auth) throw new Error('Firebase not initialized');

  const { confirmPasswordReset } = await import('firebase/auth');
  await confirmPasswordReset(auth, params.oobCode, params.password);
}

/** Maps Firebase error codes to copy a user can act on. */
export function friendlyAuthError(error: unknown): string {
  const { code, message } = error as { code?: string; message?: string };

  if (!code && !message) {
    return 'Could not reach Codzer. Check your connection and try again.';
  }

  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
      return 'We could not find an account with that email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try logging in instead.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is switched off for this Codzer project. Enable it in the Firebase console (Authentication → Sign-in method).';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return 'This reset link is invalid or has expired. Request a new one.';
    default:
      if (message) return message;
      return 'Something went wrong. Please try again.';
  }
}

/** Convenience hook for components. */
export function useAuth(): AuthState {
  return useStore(store);
}

/** Home path constant. */
export const APP_HOME_PATH = '/';
