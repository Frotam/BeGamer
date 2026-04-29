import { useEffect, useRef } from "react";
import {
  clearRoleRevealStorage,
  isTerminalGameState,
} from "../utils/roomState";

export const useRoomAutoReset = ({
  gameEndedAt,
  gameState,
  hostId,
  roomId,
  resetAt,
  sendMessage,
  setShowRoleReveal,
  socketUserId,
}) => {
  const awaitingResetRef = useRef(false);
  const handledEndingRef = useRef(null);
  const handledResetRef = useRef(null);

  useEffect(() => {
    if (!socketUserId) {
      return;
    }

    if (!isTerminalGameState(gameState) || !gameEndedAt) {
      return;
    }

    if (hostId !== socketUserId) {
      return;
    }

    awaitingResetRef.current = true;
    const endingKey = `${gameState}:${gameEndedAt}`;

    if (handledEndingRef.current === endingKey) {
      return;
    }

    handledEndingRef.current = endingKey;

    const timeout = setTimeout(() => {
      sendMessage({
        type: "resetRoom",
        roomId,
      });
    }, 5000);

    return () => clearTimeout(timeout);
  }, [gameEndedAt, gameState, hostId, roomId, sendMessage, socketUserId]);

  useEffect(() => {
    if (!resetAt || !awaitingResetRef.current) {
      return;
    }

    if (handledResetRef.current === resetAt) {
      return;
    }

    handledResetRef.current = resetAt;
    awaitingResetRef.current = false;
    handledEndingRef.current = null;
    setShowRoleReveal(false);
    clearRoleRevealStorage(roomId);
  }, [resetAt, roomId, setShowRoleReveal]);
};
