import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useFirebase } from "../../context/Firebase";
import {
  PLAYING_ROUND_DURATION_MS,
  TOTAL_GAME_ROUNDS,
} from "../../context/roomActions";
import { useVotingTimer } from "../voting/useVotingTimer";
import { useToast } from "../../context/Toast";
import Loader from "../Loader";

function Rightpage({ data }) {

  const {
    currentUser,
    executeCodeAndResolve,
    runCode,
    sendmessage,
    startEmergencyMeeting,
  } = useFirebase();

  const { showError } = useToast();
  const { roomid } = useParams();

  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResolvingCode, setIsResolvingCode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(
    Math.ceil(PLAYING_ROUND_DURATION_MS / 1000)
  );

  const autoRunTriggeredRef = useRef(false);
  const codeResolveTriggeredRef = useRef(false);
  const chatContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);

  const isAlive =
    currentUser?.uid
      ? data?.players?.[currentUser.uid]?.alive !== false
      : false;

  const isHost =
    data?.hostId === currentUser?.uid;

  const isCodeReviewPending =
    Boolean(data?.codeRunPending);

  const roundEndsAt =
    (data?.roundStartedAt || 0) +
    PLAYING_ROUND_DURATION_MS;

  const chatMessages = useMemo(() => {
    return Object.entries(data?.chat || {})
      .map(([id, chat]) => ({
        id,
        ...chat,
      }))
      .sort(
        (a, b) =>
          (a.createdAt || 0) -
          (b.createdAt || 0)
      );
  }, [data?.chat]);


  const handleScroll = () => {

    const el = chatContainerRef.current;

    if (!el) return;

    const threshold = 20;

    isAtBottomRef.current =
      el.scrollHeight -
        el.scrollTop -
        el.clientHeight <
      threshold;
  };

  useEffect(() => {

    const el = chatContainerRef.current;

    if (!el) return;

    if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }

  }, [chatMessages]);



  useVotingTimer({

    isActive:
      data?.gameState === "playing" &&
      Boolean(data?.roundStartedAt) &&
      !isCodeReviewPending,

    endTime: roundEndsAt,

    onTimeChange: setTimeLeft,

    onExpire: async () => {

      if (!isHost) return;

      if (autoRunTriggeredRef.current)
        return;

      autoRunTriggeredRef.current = true;

      try {

        await runCode(roomid);

      } catch (error) {

        showError(error.message);

      }

    },

  });



  useEffect(() => {

    if (!isCodeReviewPending) {
      codeResolveTriggeredRef.current = false;
      return;
    }

    if (!isHost) return;

    if (codeResolveTriggeredRef.current)
      return;

    codeResolveTriggeredRef.current = true;

    const runAndResolveCode = async () => {
      try {

        setIsResolvingCode(true);

        await executeCodeAndResolve(roomid);

      } catch (error) {

        showError(error.message);

      } finally {

        setIsResolvingCode(false);

      }
    };

    runAndResolveCode();

  }, [executeCodeAndResolve, isCodeReviewPending, isHost, roomid, showError]);




  const handleSubmit =
    async (event) => {

      event.preventDefault();

      if (
        !message.trim() ||
        !isAlive ||
        isCodeReviewPending
      )
        return;

      try {

        setIsSending(true);

        await sendmessage(
          roomid,
          message
        );

        setMessage("");

      } catch (error) {

        showError(error.message);

      } finally {

        setIsSending(false);

      }

    };


  const handleEmergencyMeeting =
    async () => {

      try {

        await startEmergencyMeeting(
          roomid
        );

      } catch (error) {

        showError(error.message);

      }

    };
  return (

    <div className="rightpage-layout">

      <div className="rightpage-panel">

        <div className="rightpage-header">

          <div>

            <p className="rightpage-label">
              Round
            </p>

            <h2>
              Round {data?.currentRound || 1} /{" "}
              {TOTAL_GAME_ROUNDS}
            </h2>

          </div>

          <div className="rightpage-timer">

            <p className="rightpage-label">
              Time left
            </p>

            <span>
              {timeLeft}s
            </span>

          </div>

        </div>



        <div className="rightpage-actions">

          <button
            className="game-btn emergency-btn"
            onClick={
              handleEmergencyMeeting
            }
            disabled={
              !isAlive ||
              data?.gameState !==
                "playing" ||
              isCodeReviewPending
            }
          >
            Emergency Meeting
          </button>

        </div>



        {isCodeReviewPending && (

          <div className="review-panel">

            <p className="review-text">
              {data?.codeRunReason ||
                "Running code..."}
            </p>

            {isResolvingCode && (

              <Loader message="Compiling code........" />

            )}

          </div>

        )}



        <div className="chat-panel">

          <div className="chat-panel-header">

            <div>

              <p className="rightpage-label">
                Team Chat
              </p>

              <h3>
                Discussion
              </h3>

            </div>

          </div>



          <div
            className="chat-messages rightpage-chat-messages"
            ref={chatContainerRef}
            onScroll={handleScroll}
          >

            {chatMessages.length >
            0 ? (

              chatMessages.map(
                (chat) => (

                  <div
                    key={chat.id}
                    className="chat-message"
                  >

                    <strong
                      className="chat-sender"
                      style={{
                        color:
                          chat.uid ===
                          currentUser?.uid
                            ? "#4caf50"
                            : "#2f80ff",
                      }}
                    >
                      {chat.uid ===
                      currentUser?.uid
                        ? "You"
                        : chat.name}
                      :
                    </strong>{" "}

                    <span>
                      {chat.text}
                    </span>

                  </div>

                )
              )

            ) : (

              <p className="no-messages">
                No messages yet.
              </p>

            )}

          </div>



          <form
            onSubmit={handleSubmit}
            className="chat-form"
          >

            <input
              type="text"
              value={message}
              onChange={(e) =>
                setMessage(e.target.value)
              }
              placeholder="Send a message..."
              disabled={
                !isAlive ||
                isCodeReviewPending
              }
              className="chat-input"
            />

            <button
              type="submit"
              disabled={
                isSending ||
                !message.trim() ||
                !isAlive ||
                isCodeReviewPending
              }
              className="chat-send-btn"
            >
              {isSending
                ? "..."
                : "Send"}
            </button>

          </form>

        </div>



        {!isAlive && (

          <p className="spectator-note">
            You are spectating.
          </p>

        )}

      </div>

    </div>

  );

}

export default Rightpage;
