import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useFirebase } from "../context/Firebase";
import Votingpage from "./voting/Votingpage";
import Loader from "./Loader/Loader";
import { useToast } from "../context/Toast";

function StartButton({ data }) {
  const { roomid } = useParams();
  const { currentUser, startVoting } = useFirebase();
  const { showError } = useToast();
  const [isStarting, setIsStarting] = useState(false);

  if (!data || !currentUser) {
    return <Loader message="Loading room..." compact />;
  }

  if (!data.players?.[currentUser.uid]) {
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

  const handleStartVoting = async () => {
    try {
      setIsStarting(true);
      await startVoting(roomid);
    } catch (error) {
      setIsStarting(false);
      showError(error.message);
    }
  };

  if (isStarting) {
    return <Loader message="Starting voting..." compact />;
  }

  return data.hostId === currentUser.uid ? (
    <button className="game-btn arcade" onClick={handleStartVoting}>
      Start voting
      <span className="pixel-runner"></span>
    </button>
  ) : (
    <Loader message="Waiting for the host..." compact />
  );
}

export default StartButton;
