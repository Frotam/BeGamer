import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useFirebase } from "../../context/Firebase";
import Loader from "../Loader/Loader";
import { useVotingTimer } from "../voting/useVotingTimer";
import { MEETING_DURATION_MS } from "../../context/roomActions";
import { useToast } from "../../context/Toast";
import SkyBackground from "../Background/SkyBackground";

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
  const [isAtBottom, setIsAtBottom] = useState(true);

  const chatContainerRef = useRef(null);

  const chatMessages = useMemo(() => {
    return Object.entries(data?.chat || {})
      .map(([id, chat]) => ({ id, ...chat }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [data?.chat]);

  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;

    const threshold = 20;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    setIsAtBottom(atBottom);
  };

  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;

    if (isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages, isAtBottom]);

  if (!currentUser || !data?.players) {
    return <Loader message="Loading meeting..." />;
  }

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
      <div className="emergency-meeting-layout">
        <div className="emergency-meeting-container">
          <div className="emergency-header">
            <span className="sky-kicker arcade">Emergency Meeting</span>
            <h1 className="arcade">Discuss and vote</h1>
            <p className="emergency-reason">
              {data.meetingReason || "Discuss carefully and vote out the saboteur."}
            </p>
            {!isAlive && (
              <p className="spectating-notice">You are spectating this meeting.</p>
            )}
          </div>

          <div className="emergency-content">
            <div className="voting-section">
              <div className="vote-timer">{timeLeft}s</div>

              <div className="vote-topic-list emergency-vote-list">
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

              {!isMeetingOpen && <p className="resolution-message">{resolutionMessage}</p>}
              {!isMeetingOpen && !isHost && (
                <Loader message="Returning to the game..." />
              )}
            </div>

            <div className="chat-section">
  <h3 className="chat-header">Discussion Chat</h3>

  <div
    className="chat-messages"
    ref={chatContainerRef}
    onScroll={handleScroll}
  >
    {chatMessages.length > 0 ? (
      chatMessages.map((chat) => (
        <div key={chat.id} className="chat-message">
          <strong
            className="chat-sender"
            style={{
              color:
                chat.uid === currentUser?.uid
                  ? "#4caf50"
                  : "#2f80ff",
            }}
          >
            {chat.uid === currentUser?.uid ? "You" : chat.name}:
          </strong>{" "}
          <span>{chat.text}</span>
        </div>
      ))
    ) : (
      <p className="no-messages">No messages yet.</p>
    )}
  </div>

  <form onSubmit={handleSendMessage} className="chat-form">
    <input
      type="text"
      value={message}
      onChange={(event) => setMessage(event.target.value)}
      placeholder="Send a message..."
      disabled={!isAlive}
      className="chat-input"
    />
    <button
      type="submit"
      disabled={isSending || !message.trim() || !isAlive}
      className="chat-send-btn"
    >
      {isSending ? "..." : "Send"}
    </button>
  </form>
</div>
          </div>
        </div>
      </div>
    </SkyBackground>
  );
}

export default EmergencyMeetingPage;
