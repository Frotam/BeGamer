import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useFirebase } from "../context/Firebase";
import Loader from "./Loader";
import { useVotingTimer } from "./voting/useVotingTimer";
import { MEETING_DURATION_MS } from "../context/roomActions";
import { useToast } from "../context/Toast";
import SkyBackground from "./SkyBackground";

function EmergencyMeetingPage({ data }) {
  const { roomid } = useParams();
  const { currentUser, finalizeMeeting, voteInMeeting, sendmessage } = useFirebase();
  const { showError } = useToast();
  const [timeLeft, setTimeLeft] = useState(Math.ceil(MEETING_DURATION_MS / 1000));
  const [isMeetingOpen, setIsMeetingOpen] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  if (!currentUser || !data?.players) {
    return <Loader message="Loading meeting..." />;
  }

  const chatMessages = useMemo(() => {
    return Object.entries(data?.chat || {})
      .map(([id, chat]) => ({ id, ...chat }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [data?.chat]);

  const alivePlayers = Object.values(data.players).filter(
    (player) => player?.alive !== false
  );
  const isHost = data.hostId === currentUser.uid;
  const isAlive = data.players?.[currentUser.uid]?.alive !== false;
  const currentVote = data.meetingVotes?.[currentUser.uid] || null;
  const totalVotes = Object.keys(data.meetingVotes || {}).length;
  const meetingEndsAt = (data.meetingStartedAt || 0) + MEETING_DURATION_MS;

  useVotingTimer({
    isActive: isMeetingOpen,
    endTime: meetingEndsAt,
    onTimeChange: setTimeLeft,
    onExpire: () => {
      setIsMeetingOpen(false);
    },
  });

  useEffect(() => {
    setIsMeetingOpen(true);
    setIsFinishing(false);
    setResolutionMessage("");
    setTimeLeft(Math.ceil(MEETING_DURATION_MS / 1000));
  }, [data.meetingStartedAt]);

  useEffect(() => {
    if (totalVotes === alivePlayers.length && alivePlayers.length > 0) {
      setIsMeetingOpen(false);
    }
  }, [alivePlayers.length, totalVotes]);

  useEffect(() => {
    if (isMeetingOpen) return;

    const resolvedVotes = { ...(data.meetingVotes || {}) };
    const voteCounts = {};

    alivePlayers.forEach((player) => {
      if (!resolvedVotes[player.uid]) {
        resolvedVotes[player.uid] = "skip";
      }
    });

    Object.values(resolvedVotes).forEach((targetId) => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    const highestVoteCount = Math.max(0, ...Object.values(voteCounts));
    const topTargets = Object.entries(voteCounts)
      .filter(([, count]) => count === highestVoteCount)
      .map(([targetId]) => targetId);

    const resolvedMessage =
      highestVoteCount === 0 || topTargets.length !== 1 || topTargets[0] === "skip"
        ? "Everyone skipped. Returning to the game..."
        : `${data.players?.[topTargets[0]]?.name || "A player"} was voted out. Returning to the game...`;

    setResolutionMessage(resolvedMessage);

    if (!isHost) return;

    const timeout = setTimeout(async () => {
      try {
        setIsFinishing(true);
        await finalizeMeeting(roomid);
      } catch (error) {
        setIsFinishing(false);
        showError(error.message);
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [data.meetingVotes, data.players, finalizeMeeting, isHost, isMeetingOpen, roomid]);

  const handleVote = async (targetId) => {
    if (!isMeetingOpen || !isAlive) return;

    try {
      await voteInMeeting(roomid, targetId);
    } catch (error) {
      showError(error.message);
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();

    if (!message.trim() || !isAlive) return;

    try {
      setIsSending(true);
      await sendmessage(roomid, message);
      setMessage("");
    } catch (error) {
      showError(error.message);
    } finally {
      setIsSending(false);
    }
  };

  if (isFinishing) {
    return <Loader message="Resolving meeting..." />;
  }

  return (
    <SkyBackground>
      <div className="pregame-layout">
        <div className="sky-panel pregame-panel voting-page">
          <span className="sky-kicker arcade">Emergency Meeting</span>
          <h1 className="arcade">Discuss and vote</h1>
          <p className="pregame-copy">
            {data.meetingReason || "Discuss carefully and vote out the saboteur."}
          </p>
          <div className="vote-timer">{timeLeft}s</div>

          {!isAlive && (
            <p className="pregame-copy">You are spectating this meeting.</p>
          )}

          <div className="vote-topic-list">
            {alivePlayers.map((player) => (
              <button
                key={player.uid}
                className={`vote-topic ${currentVote === player.uid ? "selected" : ""}`.trim()}
                onClick={() => handleVote(player.uid)}
                disabled={!isAlive || !isMeetingOpen}
              >
                <span>Vote {player.name}</span>
                <span>{currentVote === player.uid ? "Your vote" : "Tap to choose"}</span>
              </button>
            ))}

            <button
              className={`vote-topic ${currentVote === "skip" ? "selected" : ""}`.trim()}
              onClick={() => handleVote("skip")}
              disabled={!isAlive || !isMeetingOpen}
            >
              <span>Skip vote</span>
              <span>{currentVote === "skip" ? "Your vote" : "Stay neutral"}</span>
            </button>
          </div>

          <p className="vote-status">Total votes: {totalVotes}</p>

          {!isMeetingOpen && <p className="pregame-copy">{resolutionMessage}</p>}
          {!isMeetingOpen && !isHost && (
            <Loader message="Returning to the game..." />
          )}

          <hr style={{ margin: "16px 0", opacity: 0.3 }} />

          <h3 style={{ marginBottom: 8 }}>Discussion Chat</h3>
          <div
            style={{
              maxHeight: 200,
              overflow: "auto",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 6,
              padding: 8,
              marginBottom: 12,
              background: "rgba(0,0,0,0.2)",
            }}
          >
            {chatMessages.length > 0
              ? chatMessages.map((chat) => (
                  <div
                    key={chat.id}
                    style={{
                      fontSize: 12,
                      marginBottom: 6,
                      lineHeight: 1.4,
                      color: "#e0e0e0",
                    }}
                  >
                    <strong
                      style={{
                        color:
                          chat.uid === currentUser?.uid ? "#4caf50" : "#2f80ff",
                      }}
                    >
                      {chat.uid === currentUser?.uid ? "You" : chat.name}:
                    </strong>{" "}
                    <span>{chat.text}</span>
                  </div>
                ))
              : <p style={{ fontSize: 12, opacity: 0.6 }}>No messages yet.</p>}
          </div>

          <form onSubmit={handleSendMessage}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Send a message..."
                disabled={!isAlive}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.3)",
                  color: "#fff",
                  fontSize: 12,
                }}
              />
              <button
                type="submit"
                disabled={isSending || !message.trim() || !isAlive}
                style={{
                  padding: "8px 16px",
                  background: !isAlive ? "#666" : "#2f80ff",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: !isAlive || isSending || !message.trim() ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {isSending ? "..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </SkyBackground>
  );
}

export default EmergencyMeetingPage;
