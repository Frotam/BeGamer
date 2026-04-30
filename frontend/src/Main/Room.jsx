import { useLocation } from "react-router-dom";
import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Mainlog from "../components/Pages/Mainlog";
import Votingpage from "../components/voting/Votingpage";
import Loader from "../components/Loader/Loader";
import EmergencyMeetingPage from "../components/Pages/EmergencyMeetingPage";
import RoleRevealPage from "../components/Pages/RoleRevealPage";
import "bootstrap-icons/font/bootstrap-icons.css";
import { useToast } from "../context/Toast";
import { useSocket } from "../context/Socketcontext";
import RoomLobbyView from "./components/RoomLobbyView";
import RoomResultView from "./components/RoomResultView";
import { useBackNavigationGuard } from "./hooks/useBackNavigationGuard";
import { useRoleReveal } from "./hooks/useRoleReveal";
import { useRoomAutoReset } from "./hooks/useRoomAutoReset";
import { useRoomJoin } from "./hooks/useRoomJoin";
import { useRoomLeaveProtection } from "./hooks/useRoomLeaveProtection";
import { useRoomSocketState } from "./hooks/useRoomSocketState";
import { isTerminalGameState } from "./utils/roomState";

function Room() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showInfo } = useToast();
  const { roomid } = useParams();

  const [roomData, setRoomData] = useState(null);
  const [roomError, setRoomError] = useState("");
  const { isConnected, socketUserId, sendMessage, on, off } = useSocket();
  const currentPlayer = socketUserId ? roomData?.players?.[socketUserId] : null;
  const currentRole = currentPlayer?.role || null;
  const isAlivePlayer = currentPlayer?.alive !== false;
  const { showRoleReveal, setShowRoleReveal } = useRoleReveal({ // revel the role sets a local storage key helping to not make rerenders 
    currentRole,
    currentRound: roomData?.currentRound,
    gameState: roomData?.gameState,
    roomId: roomid,
  });

  useRoomJoin({ // this is helping to identify that is username their or not 
    isConnected,
    navigate,
    roomId: roomid,
    sendMessage,
    setRoomError,
    socketUserId,
  });
  useRoomSocketState({ // this is ccausing the data to be rendered  here 
    navigate,
    off,
    on,
    setRoomData,
    setRoomError,
  });
  useBackNavigationGuard({
    gameState: roomData?.gameState,
    showInfo,
  });
  useRoomLeaveProtection({// creates a clone of the window so  player can not press bacck while playing or meeting
    gameState: roomData?.gameState,
    isAlivePlayer,
    roomId: roomid,
    sendMessage,
  });
  useRoomAutoReset({
    gameEndedAt: roomData?.gameEndedAt,
    gameState: roomData?.gameState,
    hostId: roomData?.hostId,
    resetAt: roomData?.resetAt,
    roomId: roomid,
    sendMessage,
    setShowRoleReveal,
    socketUserId,
  });

  const copyLink = () => {
    const fullUrl = `${window.location.origin}${location.pathname}${location.search}${location.hash}`;
    navigator.clipboard.writeText(fullUrl);
  };

  if (roomError) return <h2>{roomError}</h2>;

  if (!roomData) return <Loader message="Joining room..." />;
  if (roomData.gameState === "playing") {
    if (showRoleReveal) {
      return <RoleRevealPage role={roomData.players?.[socketUserId]?.role} />;
    }
    return <Mainlog data={roomData} />;
  }
  if (roomData.gameState === "voting") return <Votingpage data={roomData} />;

  if (roomData.gameState === "meeting")
    return <EmergencyMeetingPage data={roomData} />;
  if (isTerminalGameState(roomData.gameState)) {
    return <RoomResultView roomData={roomData} />;
  }

  return <RoomLobbyView onCopyLink={copyLink} roomData={roomData} />;
}

export default Room;
