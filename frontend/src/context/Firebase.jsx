import { createContext, useContext, useMemo } from "react";
import { useSocket } from "./Socketcontext";
import { useSessionUser } from "./sessionUser";

const FirebaseContext = createContext(null);

export const FirebaseProvider = ({ children }) => {
  const { sendRequest } = useSocket();
  const currentUser = useSessionUser();

  const roomActions = useMemo(
    () => ({
      sendmessage: async (roomId, message) => {
        await sendRequest({
          type: "sendChat",
          roomId,
          message,
        });
      },
      runCode: async (roomId) => {
        await sendRequest({
          type: "runCode",
          roomId,
        });
      },
      executeCodeAndResolve: async (roomId) => {
        await sendRequest({
          type: "executeCodeAndResolve",
          roomId,
        });
      },
      startEmergencyMeeting: async (roomId, reason) => {
        await sendRequest({
          type: "startEmergencyMeeting",
          roomId,
          reason,
        });
      },
      voteInMeeting: async (roomId, targetId) => {
        await sendRequest({
          type: "voteInMeeting",
          roomId,
          targetId,
        });
      },
      finalizeMeeting: async (roomId) => {
        await sendRequest({
          type: "finalizeMeeting",
          roomId,
        });
      },
      autoResetLobbyAfterGameEnd: async (roomId) => {
        await sendRequest({
          type: "resetRoom",
          roomId,
        });
      },
    }),
    [sendRequest]
  );

  return (
    <FirebaseContext.Provider
      value={{
        auth: null,
        authReady: true,
        authError: null,
        currentUser,
        ...roomActions,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext);
