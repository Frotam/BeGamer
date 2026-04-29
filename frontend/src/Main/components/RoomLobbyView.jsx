import React from "react";
import { Button } from "@mantine/core";
import SkyBackground from "../../components/Background/SkyBackground";
import StartButton from "../../components/StartButton";

const lobbyLabelStyle = {
  color: "#f59e0b",
  letterSpacing: "2px",
  textShadow: `
    0 1px 2px rgba(0,0,0,0.35),
    0 3px 6px rgba(0,0,0,0.18)
  `,
};

const lobbyTitleStyle = {
  color: "#2f80ff",
  letterSpacing: "1.6px",
  lineHeight: "1.45",
  fontWeight: "700",
  textShadow: `
    0 0 3px rgba(80,140,255,0.35),
    0 0 8px rgba(40,100,255,0.18)
  `,
};

const playerChipStyle = {
  fontSize: "24px",
  fontWeight: "bold",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

function RoomLobbyView({ onCopyLink, roomData }) {
  return (
    <SkyBackground>
      <div className="pregame-layout">
        <div className="pregame-panel room-page">
          <span className="arcade" style={lobbyLabelStyle}>
            Room Lobby
          </span>

          <h1 className="mine" style={lobbyTitleStyle}>
            Gather the crew, get everyone ready, and let the host kick off
            voting.
            <Button onClick={onCopyLink} className="mine m-2">
              <i className="bi bi-clipboard"></i>
            </Button>
          </h1>

          <div className="player-list" role="list">
            {roomData.players ? (
              Object.values(roomData.players).map((player) => (
                <div
                  key={player.uid}
                  className="player-chip mine"
                  style={playerChipStyle}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: player.color || "#888",
                      display: "inline-block",
                    }}
                  />
                  {player.name}
                  {player.uid === roomData.hostId && (
                    <i
                      className="bi bi-crown-fill"
                      style={{
                        fontSize: "18px",
                        color: "#ffd700",
                      }}
                    />
                  )}
                </div>
              ))
            ) : (
              <p>No players yet</p>
            )}
          </div>

          <div className="pregame-actions">
            <StartButton data={roomData} />
          </div>
        </div>
      </div>
    </SkyBackground>
  );
}

export default RoomLobbyView;
