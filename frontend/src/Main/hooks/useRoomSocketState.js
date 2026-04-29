import { useEffect } from "react";

export const useRoomSocketState = ({
  navigate,
  off,
  on,
  setRoomData,
  setRoomError,
}) => {
  useEffect(() => {
    const handleRoomState = (data) => {
      setRoomData(data.state);
      setRoomError("");
    };

    const handleCursorUpdate = (data) => {
      setRoomData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          codestate: {
            ...(current.codestate || {}),
            playersCursor: {
              ...(current.codestate?.playersCursor || {}),
              [data.userId]: {
                line: data.line,
                column: data.column,
                updatedAt: Date.now(),
              },
            },
          },
        };
      });
    };

    const handleError = (data) => {
      if (data.requestId) {
        return;
      }

      if (
        typeof data.message === "string" &&
        data.message.toLowerCase().includes("room not found")
      ) {
        localStorage.removeItem("pendingroom");
        navigate("/");
        return;
      }

      setRoomError(data.message);
    };

    on("roomState", handleRoomState);
    on("cursorUpdate", handleCursorUpdate);
    on("error", handleError);

    return () => {
      off("roomState", handleRoomState);
      off("cursorUpdate", handleCursorUpdate);
      off("error", handleError);
    };
  }, [navigate, off, on, setRoomData, setRoomError]);
};
