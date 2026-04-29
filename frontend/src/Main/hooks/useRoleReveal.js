import { useEffect, useRef, useState } from "react";
import {
  getRoleRevealStorageKey,
  ROLE_REVEAL_DURATION_MS,
} from "../utils/roomState";

export const useRoleReveal = ({ currentRole, currentRound, gameState, roomId }) => {
  const [showRoleReveal, setShowRoleReveal] = useState(false);
  const lastPlayingMarkerRef = useRef(null);

  useEffect(() => {
    if (!currentRole) {
      setShowRoleReveal(false);
      return;
    }

    if (gameState !== "playing") {
      setShowRoleReveal(false);
      lastPlayingMarkerRef.current = null;
      return;
    }

    if ((currentRound || 0) !== 1) {
      setShowRoleReveal(false);
      return;
    }

    const revealKey = getRoleRevealStorageKey(roomId, currentRound, currentRole);

    if (sessionStorage.getItem(revealKey) === "true") {
      setShowRoleReveal(false);
      return;
    }

    const playingMarker = `${currentRound}:${currentRole}`;

    if (lastPlayingMarkerRef.current === playingMarker) {
      return;
    }

    lastPlayingMarkerRef.current = playingMarker;
    setShowRoleReveal(true);

    const timeout = setTimeout(() => {
      sessionStorage.setItem(revealKey, "true");
      setShowRoleReveal(false);
    }, ROLE_REVEAL_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [currentRole, currentRound, gameState, roomId]);

  return {
    setShowRoleReveal,
    showRoleReveal,
  };
};
