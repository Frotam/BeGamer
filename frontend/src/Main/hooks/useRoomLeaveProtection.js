import { useEffect } from "react";
import { isActiveGameplayState } from "../utils/roomState";

export const useRoomLeaveProtection = ({
  gameState,
  isAlivePlayer,
  roomId,
  sendMessage,
}) => {
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (isActiveGameplayState(gameState) && isAlivePlayer) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload); // reload close,navigate away 

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [gameState, isAlivePlayer, roomId, sendMessage]);
};
