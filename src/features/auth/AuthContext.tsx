import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, firestore, googleProvider } from "@/lib/firebase";
import { normalizeUserProfile } from "@/features/users/defaultProfile";
import type { UserProfile, UserRole } from "@/types/models";

interface Credentials {
  email: string;
  password: string;
  displayName?: string;
  role?: UserRole;
}

interface AuthContextValue {
  currentUser: UserProfile | null;
  authReady: boolean;
  isDemoMode: boolean;
  login: (credentials: Credentials) => Promise<void>;
  signup: (credentials: Credentials) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const saveProfile = async (profile: UserProfile) => {
  if (!firestore) {
    throw new Error("Firebase is not configured. Add your Firebase environment values to continue.");
  }

  await setDoc(
    doc(firestore, "users", profile.id),
    {
      ...profile,
      createdAt: profile.createdAt || serverTimestamp(),
    },
    { merge: true },
  );
};

const loadProfile = async (firebaseUser: User): Promise<UserProfile> => {
  if (!firestore) {
    throw new Error("Firebase is not configured. Add your Firebase environment values to continue.");
  }

  const profileRef = doc(firestore, "users", firebaseUser.uid);
  const snapshot = await getDoc(profileRef);

  if (snapshot.exists()) {
    return normalizeUserProfile({
      id: firebaseUser.uid,
      ...(snapshot.data() as Partial<UserProfile>),
    });
  }

  const fallbackProfile = normalizeUserProfile({
    id: firebaseUser.uid,
    displayName: firebaseUser.displayName || "Debate Studio Member",
    email: firebaseUser.email || "",
    avatarUrl: firebaseUser.photoURL || undefined,
    role: "student",
    createdAt: new Date().toISOString(),
  });

  await saveProfile(fallbackProfile);
  return fallbackProfile;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!auth || !firestore) {
      setCurrentUser(null);
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        setAuthReady(true);
        return;
      }

      void loadProfile(firebaseUser)
        .then((profile) => {
          setCurrentUser(profile);
        })
        .catch(() => {
          setCurrentUser(null);
        })
        .finally(() => {
          setAuthReady(true);
        });
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      authReady,
      isDemoMode: !auth || !firestore,
      login: async ({ email, password }) => {
        if (!auth || !firestore) {
          throw new Error("Firebase is not configured. Add your Firebase environment values to log in.");
        }

        const result = await signInWithEmailAndPassword(auth, email, password);
        const profile = await loadProfile(result.user);
        setCurrentUser(profile);
      },
      signup: async ({ email, password, displayName, role = "student" }) => {
        if (!auth || !firestore) {
          throw new Error("Firebase is not configured. Add your Firebase environment values to create an account.");
        }

        const result = await createUserWithEmailAndPassword(auth, email, password);
        const profile = normalizeUserProfile({
          id: result.user.uid,
          displayName: displayName || result.user.email?.split("@")[0] || "Member",
          email,
          role,
          createdAt: new Date().toISOString(),
        });
        await saveProfile(profile);
        setCurrentUser(profile);
      },
      loginWithGoogle: async () => {
        if (!auth || !firestore) {
          throw new Error("Firebase is not configured. Add your Firebase environment values to continue with Google.");
        }

        const result = await signInWithPopup(auth, googleProvider);
        const profile = await loadProfile(result.user);
        setCurrentUser(profile);
      },
      logout: async () => {
        setCurrentUser(null);

        if (auth) {
          await firebaseSignOut(auth);
        }
      },
    }),
    [authReady, currentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
};
