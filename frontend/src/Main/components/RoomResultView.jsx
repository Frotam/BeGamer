import React from "react";
import SkyBackground from "../../components/Background/SkyBackground";
import {
  getResultAccentColor,
  getResultHeading,
  getResultTextShadow,
} from "../utils/roomState";

const containerStyle = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
  gap: "14px",
};

const messageStyle = {
  fontSize: "22px",
  maxWidth: "600px",
  color: "#2f80ff",
  letterSpacing: "1.3px",
  textShadow: `
    0 0 4px rgba(80,140,255,0.35),
    0 0 10px rgba(40,100,255,0.18)
  `,
};

function RoomResultView({ roomData }) {
  const accentColor = getResultAccentColor(roomData.gameState);

  return (
    <SkyBackground>
      <div style={containerStyle}>
        <h1
          className="mine"
          style={{
            fontSize: "52px",
            letterSpacing: "2px",
            color: accentColor,
            textShadow: getResultTextShadow(roomData.gameState),
          }}
        >
          {getResultHeading(roomData.gameState)}
        </h1>

        <p className="mine" style={messageStyle}>
          {roomData.resultMessage}
        </p>
      </div>
    </SkyBackground>
  );
}

export default RoomResultView;
