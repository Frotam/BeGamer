import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import VotingTopicList from "./VotingTopicList";
import { useVotingTimer } from "./useVotingTimer";
import { getTotalPlayers, getTotalVotes } from "./voteUtils";
import Loader from "../Loader/Loader";
import SkyBackground from "../Background/SkyBackground";
import { useToast } from "../../context/Toast";
import { useSocket } from "../../context/Socketcontext";

const VOTING_DURATION_MS = 15000;

function Votingpage({ data }) {
  const { roomid } = useParams();
  const { showError, showSuccess } = useToast();
  const { isConnected, sendMessage } = useSocket();

  const currentUserId = localStorage.getItem("uid");

  const [start, setStart] = useState(true);
  const [totalv, setTotalv] = useState(0);
  const [timeLeft, setTimeLeft] = useState(
    Math.ceil(VOTING_DURATION_MS / 1000)
  );
  const [isFinishingVote, setIsFinishingVote] = useState(false);

  const hasRedirectedRef = useRef(false);

 
  if (!data?.topics || !currentUserId) {
    return <Loader message="Loading topics..." />;
  }

  if (!data?.votingStartedAt) {
    return <Loader message="Starting voting..." />;
  }

   
  const votes = Object.values(data.votes || {});
  const currentVote = data.votes?.[currentUserId] || null;
  const votingEndsAt = data.votingStartedAt + VOTING_DURATION_MS;
  const isHost = data.hostId === currentUserId;
  const hasVotes = getTotalVotes(data.votes) > 0;

  // ⏱ Timer
  useVotingTimer({
    isActive: start,
    endTime: votingEndsAt,
    onTimeChange: setTimeLeft,
    onExpire: () => {
      setStart(false);
      setTotalv(getTotalVotes(data.votes));
    },
  });

  
  useEffect(() => {
    setStart(true);
    setTotalv(0);
    setTimeLeft(Math.ceil(VOTING_DURATION_MS / 1000));
    setIsFinishingVote(false);
    hasRedirectedRef.current = false;
  }, [data.votingStartedAt]);
 
  useEffect(() => {
    if (!data?.votes || !data?.players) return;

    const totalVotes = getTotalVotes(data.votes);
    const totalPlayers = getTotalPlayers(data.players);

    if (totalVotes === totalPlayers) {
      setTotalv(totalVotes);
      setStart(false);
    }
  }, [data]);

  
  useEffect(() => {
    if (!data?.players || !data.votingStartedAt) return;
    if (start) return;
    if (hasRedirectedRef.current) return;
    if (!isHost) return;  

    const totalVotes = getTotalVotes(data.votes);
    if (totalVotes > 0) return;
    if (data.gameState !== "voting") return;

    const redirectToLobby = async () => {
      if (!isConnected) return;

      hasRedirectedRef.current = true;
      setIsFinishingVote(true);

      try {
        sendMessage({
          type: "resetRoom",
          roomId: roomid,
        });

        showSuccess(
          "No votes were found. Redirected to lobby.",
          "Voting reset"
        );
      } catch (error) {
        showError(error.message);
      } finally {
        setIsFinishingVote(false);
      }
    };

    redirectToLobby();
  }, [
    data,
    start,
    isHost,
    isConnected,
    roomid,
    showError,
    showSuccess,
  ]);
 
  const handleFinalize = async () => {
    if (!isConnected) {
      showError("Socket not connected");
      return;
    }

    try {
      setIsFinishingVote(true);

      sendMessage({
        type: "finalizeVoting",
        roomId: roomid,
      });
    } catch (error) {
      setIsFinishingVote(false);
      showError(error.message);
    }
  };

 
  const handleRestartVoting = async () => {
    if (!isConnected) {
      showError("Socket not connected");
      return;
    }

    try {
      setIsFinishingVote(true);

      sendMessage({
        type: "startVoting",
        roomId: roomid,
      });
    } catch (error) {
      setIsFinishingVote(false);
      showError(error.message);
    }
  };


  const handleVote = (topicId) => {
    if (!start) return;

    try {
      sendMessage({
        type: "vote",
        topicId: topicId,
        roomId: roomid,
      });
    } catch (error) {
      showError(error.message);
    }
  };

  if (isFinishingVote) {
    return <Loader message="Finalizing votes..." />;
  }

  return (
    <SkyBackground>
      <div className="pregame-layout">
        <div className="sky-panel pregame-panel voting-page">
          <span className="sky-kicker arcade">Pre-Game Vote</span>
          <h1 className="arcade">Vote for a topic</h1>

          <div className="vote-timer">{timeLeft}s</div>

          <VotingTopicList
            topics={data.topics}
            votes={votes}
            currentVote={currentVote}
            isVotingOpen={start}
            onVote={handleVote}
          />

          {currentVote && start && (
            <p className="pregame-copy">
              You can change your vote before time ends.
            </p>
          )}

          {!start && (
            <p className="vote-status">
              Voting closed. Total players voted: {totalv}
            </p>
          )}

          {!start && !hasVotes && (
            <p className="pregame-copy">
              No votes were found. Redirecting everyone back to the lobby.
            </p>
          )}

          {!start && isHost && hasVotes && (
            <button className="game-btn" onClick={handleFinalize}>
              Start game
            </button>
          )}

          {!start && !isHost && hasVotes && (
            <Loader message="Waiting for the host to continue..." />
          )}

          {!start && !isHost && !hasVotes && (
            <Loader message="Waiting for the host to reset the room..." />
          )}
        </div>
      </div>
    </SkyBackground>
  );
}

export default Votingpage;