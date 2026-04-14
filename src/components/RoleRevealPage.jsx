function RoleRevealPage({ role = "Player" }) {

  const isImposter = role === "Imposter";

  const roleColor = isImposter
    ? "#ff3b3b"   
    : "#00ff88";   

  return (

    <div
      style={{
        height: "100vh",
        width: "100%",
        background: "black",

        display: "flex",
        justifyContent: "center",
        alignItems: "center",

        textAlign: "center"
      }}
    >

      <h1
        className="arcade"
        style={{
          color: roleColor,

          fontSize: "clamp(40px, 8vw, 90px)",

          letterSpacing: "4px",

          textShadow:
            isImposter
              ? "0 0 20px rgba(255,0,0,0.7)"
              : "0 0 20px rgba(0,255,136,0.7)"
        }}
      >

        {role}

      </h1>

    </div>

  );

}

export default RoleRevealPage;