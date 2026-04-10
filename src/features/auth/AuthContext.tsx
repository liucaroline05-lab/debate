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
import { mockUser } from "@/data/mockData";
import type { UserProfile, UserRole } from "@/types/models";

const SESSION_KEY = "debate-studio-session";

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

const normalizeUserProfile = (profile: Partial<UserProfile> | null | undefined): UserProfile => {
  const baseProfile = mockUser;

  return {
    ...baseProfile,
    ...profile,
    avatarUrl: profile?.avatarUrl || baseProfile.avatarUrl,
    preferences: {
      notifications: {
        ...baseProfile.preferences.notifications,
        ...profile?.preferences?.notifications,
      },
      debateDefaults: {
        ...baseProfile.preferences.debateDefaults,
        ...profile?.preferences?.debateDefaults,
      },
    },
  };
};

const sessionFromStorage = (): UserProfile | null => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeUserProfile(JSON.parse(raw) as Partial<UserProfile>);
  } catch {
    return null;
  }
};

const persistSession = (profile: UserProfile | null) => {
  if (!profile) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
};

const createFallbackProfile = (
  email: string,
  displayName: string,
  role: UserRole,
): UserProfile =>
  normalizeUserProfile({
    ...mockUser,
    id: email.toLowerCase(),
    email,
    displayName,
    role,
  });

const saveProfile = async (profile: UserProfile) => {
  if (!firestore) {
    persistSession(profile);
    return;
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
  if (firestore) {
    const profileRef = doc(firestore, "users", firebaseUser.uid);
    const snapshot = await getDoc(profileRef);

    if (snapshot.exists()) {
      return normalizeUserProfile(snapshot.data() as Partial<UserProfile>);
    }
  }

  const fallbackProfile = normalizeUserProfile({
    ...mockUser,
    id: firebaseUser.uid,
    displayName: firebaseUser.displayName || "Debate Studio Member",
    email: firebaseUser.email || "",
    avatarUrl: firebaseUser.photoURL || mockUser.avatarUrl,
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
    if (!auth) {
      setCurrentUser(sessionFromStorage());
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
          persistSession(profile);
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
      isDemoMode: !auth,
      login: async ({ email, password }) => {
        if (!auth) {
          const profile = createFallbackProfile(email, "Demo Debater", "student");
          persistSession(profile);
          setCurrentUser(profile);
          return;
        }

        const result = await signInWithEmailAndPassword(auth, email, password);
        const profile = await loadProfile(result.user);
        setCurrentUser(profile);
      },
      signup: async ({ email, password, displayName, role = "student" }) => {
        if (!auth) {
          const profile = createFallbackProfile(
            email,
            displayName || "Demo Debater",
            role,
          );
          persistSession(profile);
          setCurrentUser(profile);
          return;
        }

        const result = await createUserWithEmailAndPassword(auth, email, password);
        const profile = normalizeUserProfile({
          ...mockUser,
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
        if (!auth) {
          const profile = createFallbackProfile(
            "demo-google@example.com",
            "Google Demo Member",
            "coach",
          );
          persistSession(profile);
          setCurrentUser(profile);
          return;
        }

        const result = await signInWithPopup(auth, googleProvider);
        const profile = await loadProfile(result.user);
        setCurrentUser(profile);
      },
      logout: async () => {
        persistSession(null);
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
