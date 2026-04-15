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
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [timeLeft, setTimeLeft] = useState(Math.ceil(PLAYING_ROUND_DURATION_MS / 1000));
  const autoRunTriggeredRef = useRef(false);
  const chatContainerRef = useRef(null);
  const isAlive = currentUser?.uid ? data?.players?.[currentUser.uid]?.alive !== false : false;
  const isHost = data?.hostId === currentUser?.uid;
  const isCodeReviewPending = Boolean(data?.codeRunPending);
  const roundEndsAt = (data?.roundStartedAt || 0) + PLAYING_ROUND_DURATION_MS;

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

  const code = data.codestate.code;
  const language=data.codestate.language;
  console.log(language);
    
  try {

    const response = await fetch("http://localhost:5000/run-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code,language })
    });

    const result = await response.json();

    if (result.success && result.output) {

     const normalizeOutput = (value) => {

  if (!value) return "";

  return String(value)     // ensures string
    .split(/[\n,]/)        // split by newline OR comma
    .map(v => v.trim())
    .filter(Boolean)
    .join(",");
};
      const actualOutput = normalizeOutput(result.output);

      const crewmateExpectedOutput =
        data.codestate.tasks.player.expectedOutput;

      const imposterExpectedOutput =
        data.codestate.tasks.imposter.expectedOutput;

      const crewmateNormalized =
        normalizeOutput(crewmateExpectedOutput);

      const imposterNormalized =
        normalizeOutput(imposterExpectedOutput);

      console.log("--- Code Execution Output Comparison ---");

      console.log(
        `Crewmate must be: ${crewmateNormalized} but got: ${actualOutput}`
      );

      console.log(
        `Imposter must be: ${imposterNormalized} but got: ${actualOutput}`
      );

      const crewmateMatches =
        actualOutput === crewmateNormalized;

      const imposterMatches =
        actualOutput === imposterNormalized;

      console.log(
        `Outputs are same: ${
          crewmateMatches
            ? "CREWMATE MATCH"
            : imposterMatches
            ? "IMPOSTER MATCH"
            : "NO MATCH"
        }`
      );

      console.log("--- End Comparison ---");

    }

  } catch (error) {

    console.error("Server error:", error);

  }

};

  return (
    <div className="rightpage-layout">
      <div className="rightpage-panel">
        <div className="rightpage-header">
          <div>
            <p className="rightpage-label">Round</p>
            <h2>Round {data?.currentRound || 1} / {TOTAL_GAME_ROUNDS}</h2>
          </div>
          <div className="rightpage-timer">
            <p className="rightpage-label">Time left</p>
            <span>{timeLeft}s</span>
          </div>
        </div>

        <div className="rightpage-actions">
          <button
            className="game-btn emergency-btn"
            onClick={handleEmergencyMeeting}
            disabled={!isAlive || data?.gameState !== "playing" || isCodeReviewPending}
          >
            Emergency Meeting
          </button>
          <button
            className="game-btn primary-btn"
            onClick={runecode}
            disabled={!isAlive || data?.gameState !== "playing" || isCodeReviewPending}
          >
            Run Code
          </button>
        </div>

        {isCodeReviewPending && (
          <div className="review-panel">
            <p className="review-text">{data?.codeRunReason || "The code result is waiting for review."}</p>
            {isHost ? (
              <div className="review-actions">
                <textarea
                  value={submittedOutput}
                  onChange={(event) => setSubmittedOutput(event.target.value)}
                  placeholder="Paste the program output here"
                  disabled={isResolvingCode}
                  rows={5}
                  className="review-input"
                />
                <button
                  className="game-btn primary-btn"
                  onClick={handleResolveCode}
                  disabled={isResolvingCode || !submittedOutput.trim()}
                >
                  Evaluate Output
                </button>
              </div>
            ) : (
              <p className="review-text">Waiting for the host to review the code result.</p>
            )}
          </div>
        )}

        <div className="chat-panel">
          <div className="chat-panel-header">
            <div>
              <p className="rightpage-label">Team Chat</p>
              <h3>Discussion</h3>
            </div>
          </div>

          <div
            className="chat-messages rightpage-chat-messages"
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

          <form onSubmit={handleSubmit} className="chat-form">
            <input
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Send a message..."
              disabled={!isAlive || isCodeReviewPending}
              className="chat-input"
            />
            <button
              type="submit"
              disabled={isSending || !message.trim() || !isAlive || isCodeReviewPending}
              className="chat-send-btn"
            >
              {isSending ? "..." : "Send"}
            </button>
          </form>
        </div>

        {!isAlive && <p className="spectator-note">You are spectating. Chat and emergency meeting are disabled.</p>}
      </div>
    </div>
  )
}

export default Rightpage
