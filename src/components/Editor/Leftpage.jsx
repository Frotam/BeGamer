import React from "react";
import { useFirebase } from "../../context/Firebase";

export default function Leftpage({ data, taskData }) {

  const { currentUser } = useFirebase();

  const playersArray =
    data?.players
      ? Object.values(data.players)
      : [];

  const currentPlayer =
    currentUser?.uid
      ? data?.players?.[currentUser.uid]
      : null;

  const role =
    currentPlayer?.role || "Player";

  const isAlive =
    currentPlayer?.alive !== false;

  const visibleTasks =
    Array.isArray(taskData?.instructions)
      ? taskData.instructions
      : [];


  return (

    <div
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        textAlign: "left"
      }}
    >

      {/* ROLE */}
      <div>

        <h3 style={{ marginBottom: 6 }}>
          Your Role
        </h3>

        <div
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background:
              role === "Imposter"
                ? "#ff4d4f22"
                : "#4caf5022",
            color:
              role === "Imposter"
                ? "#ff4d4f"
                : "#4caf50",
            fontWeight: 600,
            width: "fit-content"
          }}
        >

          {role}

        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            opacity: 0.8
          }}
        >

          Status:
          {" "}
          {isAlive
            ? "Alive"
            : "Spectator"}

        </div>

      </div>



      {/* TASKS */}
      <div>

        <h3 style={{ marginBottom: 8 }}>
          Your Tasks
        </h3>

        {

          visibleTasks.length > 0
            ? (

              <ol
                style={{
                  paddingLeft: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}
              >

                {

                  visibleTasks.map(
                    (task, index) => (

                      <li
                        key={index}
                        style={{
                          lineHeight: 1.4
                        }}
                      >

                        {task}

                      </li>

                    )
                  )

                }

              </ol>

            )

            : (

              <div
                style={{ opacity: 0.6 }}
              >

                No tasks assigned yet.

              </div>

            )

        }

      </div>
     
      <div>

        <h3 style={{ marginBottom: 8 }}>
          Players
        </h3>

        {

          playersArray.length > 0
            ? (

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}
              >

                {

                  playersArray.map(
                    (player) => {

                      const isMe =
                        player.uid ===
                        currentUser?.uid;

                      return (

                        <div

                          key={player.uid}

                          style={{

                            padding: "6px 10px",

                            borderRadius: 6,

                            background:
                              isMe
                                ? "#1976d222"
                                : "#ffffff10",

                            border:
                              player.alive === false
                                ? "1px dashed #aaa"
                                : "1px solid transparent",

                            fontSize: 14,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,

                          }}

                        >

                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: player.color || "#3cd439",
                              display: "inline-block",
                            }}
                          />

                          {player.name}

                          {

                            isMe &&
                            " (You)"

                          }

                          {

                            player.alive === false &&
                            "/"

                          }

                        </div>

                      );

                    }

                  )

                }

              </div>

            )

            : (

              <div
                style={{ opacity: 0.6 }}
              >

                No players yet

              </div>

            )

        }

      </div>

    </div>

  );

}