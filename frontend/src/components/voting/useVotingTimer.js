import { useEffect, useRef } from "react";

export const useVotingTimer = ({
  isActive,
  endTime,
  onTimeChange,
  onExpire,
}) => {
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    if (!isActive || !endTime) {
      hasExpiredRef.current = false;
      return;
    }

    const syncTimer = () => {
      const remainingMs = Math.max(endTime - Date.now(), 0);
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      onTimeChange(remainingSeconds);

      if (remainingMs === 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpire();
      }
    };

    syncTimer();

    const timer = setInterval(syncTimer, 250);

    return () => clearInterval(timer);
  }, [endTime, isActive, onExpire, onTimeChange]);
};
