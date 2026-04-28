import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Loader from "../components/Loader/Loader";
import SkyBackground from "../components/Background/SkyBackground";
import { useToast } from "../context/Toast";
import { ensureSessionUser } from "../context/sessionUser";
import { useSocket } from "../context/Socketcontext";

function Home() {
  const navigate = useNavigate();
  const { showError } = useToast();

  const usernameInput = useRef(null);
  const roomInput = useRef(null);

  const [pendingRoom] = useState(localStorage.getItem("pendingroom") || "");
  const [actionMessage, setActionMessage] = useState("");
  const [connectionError, setConnectionError] = useState(null);

  const { isConnected, sendMessage, on, off } = useSocket();

  
  useEffect(() => {
    const handleRoom = (data) => {
      navigate(`/rooms/${data.roomId}`);
    };

    const handleError = (data) => {
      setActionMessage("");
      setConnectionError(data.message);
      showError(data.message);
    };

    on("roomCreated", handleRoom);
    on("playerJoined", handleRoom);
    on("error", handleError);

    return () => {
      off("roomCreated", handleRoom);
      off("playerJoined", handleRoom);
      off("error", handleError);
    };
  }, [on, off, navigate, showError]);

  const getName = () => {
    const name = usernameInput.current?.value.trim() || "";
    if (!name) throw new Error("Enter username");
    return name;
  };

  const handleJoin = () => {
    if (!isConnected) {
      showError("WebSocket is not connected yet.");
      return;
    }

    const roomId = roomInput.current?.value.trim() || "";
    if (!roomId) {
      showError("Room Code is Empty");
      return;
    }

    try {
      const name = getName();
      const sessionUser = ensureSessionUser(name);

      setActionMessage("Joining room...");

      sendMessage({
        type: "join",
        username: name,
        uid: sessionUser.uid,
        roomId,
      });
    } catch (err) {
      setActionMessage("");
      showError(err.message);
    }
  };

  const handleCreateRoom = () => {
    if (!isConnected) {
      showError("WebSocket is not connected yet.");
      return;
    }

    try {
      const name = getName();
      const sessionUser = ensureSessionUser(name);

      sendMessage({
        type: "createroom",
        username: name,
        uid: sessionUser.uid,
      });
    } catch (err) {
      showError(err.message);
    }
  };


  if (actionMessage) {
    return <Loader message={actionMessage} />;
  }

  return (
    <SkyBackground>
      <div className="home-container">
        <div className="sky-panel home-panel">
          <h1 className="arcade title" style={{ color: "#f0942b" }}>
            Don
          </h1>
          <h1 className="arcade title" style={{ color: "#da498a" }}>
            Mafia
          </h1>

          <p className="arcade subtitle">Sabotage or survive</p>
          <p
            className="pregame-copy"
            style={{
              color: isConnected ? "#4caf50" : "#ffb347",
              minHeight: 20,
            }}
          >
            {isConnected
              ? "Connected to game server"
              : connectionError || "Connecting to game server..."}
          </p>

          <input
            className="game-input"
            type="text"
            ref={usernameInput}
            placeholder="Username"
            defaultValue={localStorage.getItem("username") || ""}
          />

          <div className="join-row">
            <input
              className="game-input"
              type="text"
              ref={roomInput}
              defaultValue={pendingRoom}
              placeholder="Room code"
            />

            <button
              className="game-btn mine"
              onClick={handleJoin}
              disabled={!isConnected}
            >
              Join
            </button>
          </div>

          <button
            className="game-btn host-btn mine"
            onClick={handleCreateRoom}
            disabled={!isConnected}
          >
            Host Game
          </button>
        </div>
      </div>
    </SkyBackground>
  );
}

export default Home;
