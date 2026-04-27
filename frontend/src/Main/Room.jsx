import { useLocation } from "react-router-dom";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
 
import StartButton from "../components/StartButton";
import Mainlog from "../components/Pages/Mainlog";
import Votingpage from "../components/voting/Votingpage";
import Loader from "../components/Loader/Loader";
import EmergencyMeetingPage from "../components/Pages/EmergencyMeetingPage";
import SkyBackground from "../components/Background/SkyBackground";
import RoleRevealPage from "../components/Pages/RoleRevealPage";
import { Button } from "@mantine/core";
import "bootstrap-icons/font/bootstrap-icons.css";
import { useToast } from "../context/Toast";
import { useSessionUser } from "../context/sessionUser";
import { useSocket } from "../context/Socketcontext";

const ROLE_REVEAL_DURATION_MS = 4000;
const ROLE_REVEAL_STORAGE_PREFIX = "begameer_role_reveal_shown";

const getRoleRevealStorageKey = (roomId, round, role) => {
  return `${ROLE_REVEAL_STORAGE_PREFIX}:${roomId}:${round}:${role}`;
};

const clearRoleRevealStorage = (roomId) => {
  if (typeof sessionStorage === "undefined") return;

  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith(`${ROLE_REVEAL_STORAGE_PREFIX}:${roomId}:`)) {
      sessionStorage.removeItem(key);
    }
  });
};

function Room() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showInfo } = useToast();
  const { roomid } = useParams();
  const sessionUser = useSessionUser();
  

  const [roomData, setRoomData] = useState(null);
  const [roomError, setRoomError] = useState("");
  const [showRoleReveal, setShowRoleReveal] = useState(false);

  const handledEndingRef = useRef(null);
  const handledResetRef = useRef(null);
  const awaitingResetRef = useRef(false);
  const lastPlayingMarkerRef = useRef(null);
  const { isConnected, sendMessage, on, off } = useSocket();

  useEffect(() => {
    if (!isConnected) return;

    const username = localStorage.getItem("username");
    const uid = sessionUser?.uid || localStorage.getItem("uid");

    if (!username) {
      localStorage.setItem("pendingroom", roomid);
      navigate("/");
      return;
    }

    if (!uid) {
      setRoomError("User session is still loading.");
      return;
    }

    sendMessage({
      type: "join",
      username,
      uid,
      roomId: roomid,
    });
  }, [isConnected, navigate, roomid, sendMessage, sessionUser?.uid]);
  // listen the room updates
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
  }, [on, off]);

  const copyLink = () => {
    const fullUrl = `${window.location.origin}${location.pathname}${location.search}${location.hash}`;
    navigator.clipboard.writeText(fullUrl);
  };

  const hasBlockedBackRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!roomData) return;

    const isActiveGame =
      roomData.gameState === "playing" || roomData.gameState === "meeting";

    if (!isActiveGame) return;

    if (!window.history.state || !window.history.state.roomGuard) {
      window.history.pushState({ roomGuard: true }, "", window.location.href);
    }

    const handlePopState = () => {
      if (
        roomData.gameState === "playing" ||
        roomData.gameState === "meeting"
      ) {
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
  }, [roomData?.gameState, roomid, showInfo]);

  // useEffect(() => {
  //   if (!roomData || !sessionUser) return;

  //   if (roomData.hostId !== sessionUser.uid) return;

  //   syncRoomState(roomid).catch((error) => {
  //     console.error("Failed to sync room state:", error);
  //   });
  // }, [roomData, roomid, sessionUser, syncRoomState]);

  useEffect(() => {
    if (!roomData || !sessionUser) {
      setShowRoleReveal(false);
      return;
    }

    if (roomData.gameState !== "playing") {
      setShowRoleReveal(false);
      lastPlayingMarkerRef.current = null;
      return;
    }

    if ((roomData.currentRound || 0) !== 1) {
      setShowRoleReveal(false);
      return;
    }

    const currentRole = roomData.players?.[sessionUser.uid]?.role || null;

    if (!currentRole) {
      console.log("waiting role");
      
      return;
    }

    const revealKey = getRoleRevealStorageKey(
      roomid,
      roomData.currentRound,
      currentRole,
    );

    if (sessionStorage.getItem(revealKey) === "true") {
      setShowRoleReveal(false);
      return;
    }

    const playingMarker = `${roomData.currentRound}:${currentRole}`;

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
  }, [
    roomData?.gameState,
    roomData?.currentRound,
    roomData?.players?.[sessionUser?.uid]?.role,
    roomid,
    sessionUser?.uid,
  ]);

  useEffect(() => {
    if (!roomData || !sessionUser) {
      return;
    }

    const isTerminalState =
      roomData.gameState === "crew_win" ||
      roomData.gameState === "imposter_win" ||
      roomData.gameState === "insufficient" ||
      roomData.gameState === "draw";

    const gameEndedAt = roomData.gameEndedAt || null;

    if (!isTerminalState || !gameEndedAt) {
      return;
    }
    if (roomData.hostId !== sessionUser.uid) {
      return;
    }
    awaitingResetRef.current = true;
    const endingKey = `${roomData.gameState}:${gameEndedAt}`;
    if (handledEndingRef.current === endingKey) {
      return;
    }
    handledEndingRef.current = endingKey;
      const timeout = setTimeout(() => {
    
    sendMessage({
      type:"resetRoom",
      roomId:roomid
    }) 
  }, 5000);
  }, [
    roomData?.gameState,
    roomData?.gameEndedAt,
    roomid,
  ]);

  useEffect(() => {
    if (!roomData?.resetAt || !awaitingResetRef.current) {
      return;
    }
    if (handledResetRef.current === roomData.resetAt) {
      return;
    }
    handledResetRef.current = roomData.resetAt;
    awaitingResetRef.current = false;
    handledEndingRef.current = null;
    setShowRoleReveal(false);
    clearRoleRevealStorage(roomid);
  }, [roomData?.resetAt, roomid]);
  
  if (roomError) return <h2>{roomError}</h2>;

  if (!roomData) return <Loader message="Joining room..." />;
  if (roomData.gameState === "playing") {
    if (showRoleReveal) {
      return (
        <RoleRevealPage role={roomData.players?.[sessionUser?.uid]?.role} />
      );
    }
    return <Mainlog data={roomData} />;
  }
  if (roomData.gameState === "voting") return <Votingpage data={roomData} />;

  if (roomData.gameState === "meeting")
    return <EmergencyMeetingPage data={roomData} />;

  // RESULT SCREEN

  if (
    roomData.gameState === "crew_win" ||
    roomData.gameState === "imposter_win" ||
    roomData.gameState === "insufficient" ||
    roomData.gameState === "draw"
  ) {
    return (
      <SkyBackground>
        <div
          style={{
            minHeight: "100vh",

            display: "flex",

            flexDirection: "column",

            justifyContent: "center",

            alignItems: "center",

            textAlign: "center",

            gap: "14px",
          }}
        >
          <h1
            className="mine"
            style={{
              fontSize: "52px",

              letterSpacing: "2px",

              color:
                roomData.gameState === "crew_win"
                  ? "#22c55e"
                  : roomData.gameState === "imposter_win"
                    ? "#ff4d6d"
                    : "#7c5cff",

              textShadow:
                roomData.gameState === "crew_win"
                  ? `
                    0 0 6px rgba(34,197,94,0.45),
                    0 0 16px rgba(34,197,94,0.25)
                  `
                  : roomData.gameState === "imposter_win"
                    ? `
                    0 0 6px rgba(255,77,109,0.45),
                    0 0 16px rgba(255,77,109,0.25)
                  `
                    : roomData.gameState === "draw"
                      ? `
                    0 0 6px rgba(124,92,255,0.45),
                    0 0 16px rgba(124,92,255,0.25)
                  `
                      : `
                    0 0 6px rgba(124,92,255,0.45),
                    0 0 16px rgba(124,92,255,0.25)
                  `,
            }}
          >
            {roomData.gameState === "crew_win"
              ? "Crew Wins"
              : roomData.gameState === "imposter_win"
                ? "Imposter Wins"
                : roomData.gameState === "draw"
                  ? "No One Wins"
                  : "Insufficient Players"}
          </h1>

          <p
            className="mine"
            style={{
              fontSize: "22px",

              maxWidth: "600px",

              color: "#2f80ff",

              letterSpacing: "1.3px",

              textShadow: `
                0 0 4px rgba(80,140,255,0.35),
                0 0 10px rgba(40,100,255,0.18)
              `,
            }}
          >
            {roomData.resultMessage}
          </p>
        </div>
      </SkyBackground>
    );
  }

  // LOBBY SCREEN

  return (
    <SkyBackground>
      <div className="pregame-layout">
        <div className="pregame-panel room-page">
          <span
            className="arcade"
            style={{
              color: "#f59e0b",

              letterSpacing: "2px",
              textShadow: `
  0 1px 2px rgba(0,0,0,0.35),
  0 3px 6px rgba(0,0,0,0.18)
`,
            }}
          >
            Room Lobby
          </span>
          <h1
            className="mine"
            style={{
              color: "#2f80ff",
              letterSpacing: "1.6px",
              lineHeight: "1.45",
              fontWeight: "700",
              textShadow: `
                0 0 3px rgba(80,140,255,0.35),
                0 0 8px rgba(40,100,255,0.18)   `,
            }}
          >
            Gather the crew, get everyone ready, and let the host kick off
            voting.
            <Button onClick={copyLink} className="mine m-2">
              <i className="bi bi-clipboard"></i>
            </Button>
          </h1>
          <div className="player-list" role="list">
            {roomData.players ? (
              Object.values(roomData.players).map((player) => (
                <div
                  key={player.uid}
                  className="player-chip mine"
                  style={{
                    fontSize: "24px",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: player.color || "#888",
                      display: "inline-block",
                    }}
                  />
                  {player.name}
                  {player.uid === roomData.hostId && (
                    <i
                      className="bi bi-crown-fill"
                      style={{
                        fontSize: "18px",
                        color: "#ffd700",
                      }}
                    />
                  )}
                </div>
              ))
            ) : (
              <p>No players yet</p>
            )}
          </div>
          <div className="pregame-actions">
            <StartButton data={roomData} />
          </div>
        </div>
      </div>
    </SkyBackground>
  );
}

export default Room;
