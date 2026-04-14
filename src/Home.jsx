import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFirebase } from "./context/Firebase";
import Loader from "./components/Loader";
import SkyBackground from "./components/SkyBackground";
import { useToast } from "./context/Toast";

function Home() {
  const navigate = useNavigate();
  const { authReady, authError, createRoom, joinRoom } = useFirebase();
  const { showError } = useToast();

  const usernameInput = useRef(null);
  const roomInput = useRef(null);

  const [pendingRoom] = useState(localStorage.getItem("pendingroom") || "");
  const [actionMessage, setActionMessage] = useState("");

  const getName = () => {
    const name = usernameInput.current?.value.trim() || "";

    if (!name) {
      throw new Error("Enter username");
    }

    return name;
  };

  const handleJoin = async () => {
    if (!authReady) return;

    const roomId = roomInput.current?.value.trim() || "";
    if (!roomId) return;

    try {
      const name = getName();

      setActionMessage("Joining room...");

      localStorage.setItem("username", name);
      localStorage.removeItem("pendingroom");

      await joinRoom(roomId, name);

      navigate(`/rooms/${roomId}`);
    } catch (err) {
      setActionMessage("");
      showError(err.message);
    }
  };

  const handleCreateRoom = async () => {
    if (!authReady) return;

    try {
      const name = getName();

      const roomId = Math.random()
        .toString(36)
        .substring(2, 8);

      setActionMessage("Creating room...");

      localStorage.setItem("username", name);

      await createRoom(roomId, name);

      navigate(`/rooms/${roomId}`);
    } catch (err) {
      setActionMessage("");
      showError(err.message);
    }
  };

  if (!authReady) {
    return <Loader message="Connecting..." />;
  }

  if (actionMessage) {
    return <Loader message={actionMessage} />;
  }

  return (
    <SkyBackground>
      <div className="home-container">
        <div className="sky-panel home-panel">
          <h1
            className="arcade title"
            style={{
              color: "#f0942b",
              textShadow: `
                0 0 5px #da498a,
                0 0 10px #da498a,
                0 0 20px #da498a,
                0 0 40px #da498a
              `,
            }}
          >
            Don
          </h1>
          <h1
            className="arcade title"
            style={{
              color: "#da498a",
              textShadow: `
                0 0 5px #f0942b,
                0 0 10px #f0942b,
                0 0 20px #f0942b,
                0 0 50px #FFC107
              `,
            }}
          >
            Mafia
          </h1>
          <p className="arcade subtitle">Sabotage or survive</p>

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

            <button className="game-btn mine" onClick={handleJoin}>
              Join
            </button>
          </div>

          <button className="game-btn host-btn mine" onClick={handleCreateRoom}>
            Host Game
          </button>

          {authError && <p className="error">{authError}</p>}
        </div>
      </div>
    </SkyBackground>
  );
}

export default Home;
