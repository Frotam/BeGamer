import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useFirebase } from "../../context/Firebase";
import {
  PLAYING_ROUND_DURATION_MS,
  TOTAL_GAME_ROUNDS,
} from "../../context/roomActions";
import { useVotingTimer } from "../voting/useVotingTimer";
import { useToast } from "../../context/Toast";
import Loader from "../Loader/Loader";

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



     <div 
  className="chat-panel d-flex flex-column rounded"
  style={{ 
    width: "260px",
    height: "320px",
    overflow: "hidden",

    background: "#0f172a",           // dark blue-black
    border: "2px solid #22c55e",     // pixel green border

    boxShadow: "4px 4px 0px #22c55e", // pixel shadow

    fontFamily: "monospace",
    color: "#e5e7eb"
  }}
>

  <div 
    className="chat-panel-header p-2"
    style={{
      borderBottom: "2px solid #22c55e",
      background: "#020617"
    }}
  >

    <p 
      className="mb-0"
      style={{
        fontSize: "11px",
        color: "#22c55e",
        letterSpacing: "1px"
      }}
    >
      TEAM CHAT
    </p>

    <h6 
      className="mb-0"
      style={{
        color: "#38bdf8",
        fontWeight: "bold"
      }}
    >
      Discussion
    </h6>

  </div>


  <div
    className="chat-messages flex-grow-1 p-2"
    ref={chatContainerRef}
    onScroll={handleScroll}
    style={{
      overflowY: "auto",
      overflowX: "hidden",

      fontSize: "12px",

      background: "#020617",

      minHeight: 0
    }}
  >

    {chatMessages.length > 0 ? (

      chatMessages.map((chat) => (

        <div
          key={chat.id}
          className="mb-1"
          style={{
            wordBreak: "break-word"
          }}
        >

          <strong
            style={{
              color:
                chat.uid === currentUser?.uid
                  ? "#22c55e"    // green for you
                  : "#38bdf8",   // blue for others

              fontSize: "11px"
            }}
          >
            {chat.uid === currentUser?.uid
              ? "YOU"
              : chat.name}
            :
          </strong>{" "}

          <span
            style={{
              color: "#e5e7eb"
            }}
          >
            {chat.text}
          </span>

        </div>

      ))

    ) : (

      <p 
        className="mb-0"
        style={{
          color: "#64748b",
          fontSize: "11px"
        }}
      >
        no messages yet...
      </p>

    )}

  </div>


  <form
    onSubmit={handleSubmit}
    className="d-flex gap-1 p-2"
    style={{
      borderTop: "2px solid #22c55e",
      background: "#020617"
    }}
  >

    <input
      type="text"
      value={message}
      onChange={(e) => setMessage(e.target.value)}
      placeholder="type..."
      disabled={!isAlive || isCodeReviewPending}

      className="form-control form-control-sm"

      style={{
        background: "#020617",

        border: "2px solid #38bdf8",

        color: "#e5e7eb",

        fontSize: "12px",

        minWidth: 0
      }}
    />

    <button
      type="submit"

      disabled={
        isSending ||
        !message.trim() ||
        !isAlive ||
        isCodeReviewPending
      }

      className="btn btn-sm"

      style={{
        background: "#22c55e",

        border: "2px solid #16a34a",

        color: "#020617",

        fontWeight: "bold",

        boxShadow: "2px 2px 0px #16a34a",

        fontSize: "11px"
      }}
    >
      {isSending ? "..." : "SEND"}
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
