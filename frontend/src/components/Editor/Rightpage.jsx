import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom';
import { useFirebase } from '../../context/Firebase';
import { PLAYING_ROUND_DURATION_MS, TOTAL_GAME_ROUNDS } from '../../context/roomActions';
import { useVotingTimer } from '../voting/useVotingTimer';
import { useToast } from '../../context/Toast';
import { log } from 'firebase/firestore/pipelines';

function Rightpage({ data }) {
  const {
    currentUser,
    resolveCodeRun,
    runCode,
    sendmessage,
    startEmergencyMeeting,
  } = useFirebase();
  const { showError } = useToast();
  const { roomid } = useParams();
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResolvingCode, setIsResolvingCode] = useState(false);
  const [submittedOutput, setSubmittedOutput] = useState("");
  const [timeLeft, setTimeLeft] = useState(Math.ceil(PLAYING_ROUND_DURATION_MS / 1000));
  const autoRunTriggeredRef = useRef(false);
  const isAlive = currentUser?.uid ? data?.players?.[currentUser.uid]?.alive !== false : false;
  const isHost = data?.hostId === currentUser?.uid;
  const isCodeReviewPending = Boolean(data?.codeRunPending);
  const roundEndsAt = (data?.roundStartedAt || 0) + PLAYING_ROUND_DURATION_MS;

  const chatMessages = useMemo(() => {
    return Object.entries(data?.chat || {})
      .map(([id, chat]) => ({ id, ...chat }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [data?.chat]);

  useVotingTimer({
    isActive:
      data?.gameState === "playing" &&
      Boolean(data?.roundStartedAt) &&
      !isCodeReviewPending,
    endTime: roundEndsAt,
    onTimeChange: setTimeLeft,
    onExpire: async () => {
      if (!isHost || autoRunTriggeredRef.current) return;

      autoRunTriggeredRef.current = true;

      try {
        await runCode(roomid);
      } catch (error) {
        showError(error.message);
      }
    },
  });

  useEffect(() => {
    autoRunTriggeredRef.current = false;
    setTimeLeft(Math.ceil(PLAYING_ROUND_DURATION_MS / 1000));
    setIsResolvingCode(false);
    setSubmittedOutput("");
  }, [data?.roundStartedAt, data?.codeRunPending]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!message.trim() || !isAlive || isCodeReviewPending) return;

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

  const handleEmergencyMeeting = async () => {
    try {
      await startEmergencyMeeting(roomid);
    } catch (error) {
      showError(error.message);
    }
  };

  const handleResolveCode = async () => {
    try {
      setIsResolvingCode(true);
      await resolveCodeRun(roomid, submittedOutput);
    } catch (error) {
      setIsResolvingCode(false);
      showError(error.message);
    }
  };
  const runecode = async () => {
    console.log(data.codestate.code);
 
};
  return (
    <div>
      <h3>Round {data?.currentRound || 1} / {TOTAL_GAME_ROUNDS}</h3>
      <h3>Round timer</h3>
      <p>{timeLeft}s</p>
      <button
        onClick={handleEmergencyMeeting}
        disabled={!isAlive || data?.gameState !== "playing" || isCodeReviewPending}
      >
        Emergency
      </button>

      {isCodeReviewPending && (
        <div>
          <p>{data?.codeRunReason || "The code result is waiting for review."}</p>
          {isHost ? (
            <div>
              
              <textarea
                value={submittedOutput}
                onChange={(event) => setSubmittedOutput(event.target.value)}
                placeholder="Paste the program output here"
                disabled={isResolvingCode}
                rows={6}
              />
              <button
                onClick={handleResolveCode}
                disabled={isResolvingCode || !submittedOutput.trim()}
              >
                Evaluate output
              </button>
            </div>
          ) : (
            <p>Waiting for the host to review the code result.</p>
          )}
        </div>
      )}

      <h3>Chat</h3>
      <h1>
        <button onClick={runecode}>
          Runcode 
        </button>
      </h1>
      <div>
        {chatMessages.length > 0
          ? chatMessages.map((chat) => (
              <div key={chat.id}>
                <strong>
                  {chat.uid === currentUser?.uid ? "You" : chat.name}:
                </strong>{" "}
                <span>{chat.text}</span>
              </div>
            ))
          : <p>No messages yet.</p>}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Type a message"
          disabled={!isAlive || isCodeReviewPending}
        />
        <button
          type="submit"
          disabled={isSending || !message.trim() || !isAlive || isCodeReviewPending}
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>

      {!isAlive && <p>You are spectating. Chat and emergency meeting are disabled.</p>}
    </div>
  )
}

export default Rightpage
