import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  auth,
  database,
  firebaseDebugConfig,
  isDev,
} from "./firebaseApp";
import { createRoomActions } from "./roomActions";

const FirebaseContext = createContext(null);

export const FirebaseProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  const getRequiredUser = () => {
    const resolvedUser = auth.currentUser ?? currentUser;

    if (!resolvedUser) {
      throw new Error("Authentication is still loading.");
    }

    return resolvedUser;
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (error) {
        if (isDev) {
          console.warn("[Firebase debug] Failed to set auth persistence:", error);
        }
      }
    };

    initializeAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (isDev) {
          ("[Firebase debug] Auth ready", {
            uid: user.uid,
            isAnonymous: user.isAnonymous,
            ...firebaseDebugConfig,
          });
        }

        setCurrentUser(user);
        setAuthError(null);
        setAuthReady(true);
        return;
      }

      try {
        const credential = await signInAnonymously(auth);

        if (isDev) {
          ("[Firebase debug] Anonymous sign-in success", {
            uid: credential.user.uid,
            isAnonymous: credential.user.isAnonymous,
            ...firebaseDebugConfig,
          });
        }

        setCurrentUser(credential.user);
        setAuthError(null);
        setAuthReady(true);
      } catch (error) {
        console.error("Anonymous sign-in failed:", error);
        setCurrentUser(null);
        setAuthReady(false);
        setAuthError(
          error?.code === "auth/configuration-not-found"
            ? "Anonymous sign-in is not enabled for this Firebase project. Turn it on in Firebase Console > Authentication > Sign-in method."
            : "Firebase authentication failed. Check your Firebase config and auth settings."
        );
      }
    });

    return unsubscribe;
  }, []);

  const roomActions = createRoomActions({ database, getRequiredUser });

  return (
    <FirebaseContext.Provider
      value={{
        auth,
        authReady,
        authError,
        currentUser,
        ...roomActions,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext);
