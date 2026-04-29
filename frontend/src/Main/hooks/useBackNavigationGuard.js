import { useEffect, useRef } from "react";
import { isActiveGameplayState } from "../utils/roomState";

export const useBackNavigationGuard = ({ gameState, showInfo }) => {
  const hasBlockedBackRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isActiveGameplayState(gameState)) return;

    if (!window.history.state || !window.history.state.roomGuard) {
      window.history.pushState({ roomGuard: true }, "", window.location.href);
    }

    const handlePopState = () => {
      if (isActiveGameplayState(gameState)) {
        window.history.pushState({ roomGuard: true }, "", window.location.href);

        if (!hasBlockedBackRef.current) {
          hasBlockedBackRef.current = true;
          showInfo(
            "Back navigation is disabled while the game is active.",
            "Stay in game",
          );
        }
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [gameState, showInfo]);
};
