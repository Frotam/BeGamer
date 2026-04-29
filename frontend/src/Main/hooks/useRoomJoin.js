import { useEffect } from "react";

export const useRoomJoin = ({
  isConnected,
  navigate,
  roomId,
  sendMessage,
  setRoomError,
  socketUserId,
}) => {
  useEffect(() => {
    if (!isConnected) return;

    const username = localStorage.getItem("username");

    if (!username) {
      localStorage.setItem("pendingroom", roomId);
      navigate("/");
      return;
    }

    if (!socketUserId) {
      setRoomError("User session is still loading.");
      return;
    }

    sendMessage({
      type: "join",
      username,
      roomId,
    });
  }, [isConnected, navigate, roomId, sendMessage, setRoomError, socketUserId]);
};
