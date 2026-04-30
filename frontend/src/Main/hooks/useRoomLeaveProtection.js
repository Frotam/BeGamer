import { useEffect } from "react";
import { isActiveGameplayState } from "../utils/roomState";

export const useRoomLeaveProtection = ({
  gameState,
  isAlivePlayer,
  roomId,
  sendMessage,
}) => {
  useEffect(() => {
    const handlePageLeave = () => {
      try {
        sendMessage({
          type: "leaveRoom",
          roomId,
        });
      } catch {
        // Socket may already be closed during unload/navigation.
      }
    };

    const handleBeforeUnload = (event) => {
      if (isActiveGameplayState(gameState) && isAlivePlayer) {
        event.preventDefault();
        event.returnValue = "";
      }

      handlePageLeave();
    };

    window.addEventListener("pagehide", handlePageLeave); // tabswitching mobiles 
    window.addEventListener("beforeunload", handleBeforeUnload); // reload close,navigate away 

    return () => {
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [gameState, isAlivePlayer, roomId, sendMessage]);
};
