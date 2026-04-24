import React, { useState } from "react";
import { useParams } from "react-router-dom";
import Votingpage from "./voting/Votingpage";
import Loader from "./Loader/Loader";
import { useToast } from "../context/Toast";
import { useSocket } from "../context/Socketcontext";

function StartButton({ data }) {
  const { roomid } = useParams();
  const { showError } = useToast();
  const { isConnected, sendMessage } = useSocket();

  const currentUserId = localStorage.getItem("uid");  

  const [isStarting, setIsStarting] = useState(false);

  if (!data || !currentUserId) {
    return <Loader message="Loading room..." compact />;
  }

  if (!data.players?.[currentUserId]) {
    return <Loader message="Joining room..." compact />;
  }

  if (Object.keys(data.players).length < 3) {
    return (
      <div className="room-status-block">
        <Loader message="Waiting for players to join..." compact />
        <p className="room-status-note">Minimum players required: 3</p>
      </div>
    );
  }

  if (data.gameState === "voting") {
    return <Votingpage data={data} />;
  }

  const handleStartVoting = () => {
    if (!isConnected) {
      showError("Socket not connected");
      return;
    }

    try {
      setIsStarting(true);

      sendMessage({
        type: "startVoting",
        roomId: roomid,
      });
    } catch (error) {
      setIsStarting(false);
      showError(error.message);
    }
  };

  if (isStarting) {
    return <Loader message="Starting voting..." compact />;
  }

  return data.hostId === currentUserId ? (
    <button className="game-btn" onClick={handleStartVoting}>
      Start voting
    </button>
  ) : (
    <Loader message="Waiting for the host..." compact />
  );
}

export default StartButton;
