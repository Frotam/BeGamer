import "./App.css";
import { useState } from "react";
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  Link,
} from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import Home from "./Home";
import Test from "./Test";
import Room from "./Room";
import RoleRevealPage from "./components/RoleRevealPage";
import SkyBackground from "./components/SkyBackground";
import { FirebaseProvider } from "./context/Firebase";
import { ToastProvider } from "./context/Toast";
import "./components/Editor/EditorLayout.css";

const mockRoomId = "SKY-842";
const mockCurrentUserId = "mock-user-1";

const mockPlayers = {
  "mock-user-1": {
    uid: "mock-user-1",
    name: "Sid",
    role: "Player",
    alive: true,
    status: "alive",
  },
  "mock-user-2": {
    uid: "mock-user-2",
    name: "Aarav",
    role: "Imposter",
    alive: true,
    status: "alive",
  },
  "mock-user-3": {
    uid: "mock-user-3",
    name: "Mira",
    role: "Player",
    alive: true,
    status: "alive",
  },
  "mock-user-4": {
    uid: "mock-user-4",
    name: "Kabir",
    role: "Player",
    alive: false,
    status: "dead",
  },
};

const mockTopics = {
  bug_hunt: { label: "Debug the login bug" },
  refactor: { label: "Refactor the player sync flow" },
  ui_pass: { label: "Polish the mission dashboard" },
};

const mockVotes = {
  "mock-user-1": "bug_hunt",
  "mock-user-2": "ui_pass",
  "mock-user-3": "bug_hunt",
};

const mockChat = {
  msg1: {
    uid: "mock-user-2",
    name: "Aarav",
    text: "I think the parser broke near line 24.",
    createdAt: 1,
  },
  msg2: {
    uid: "mock-user-1",
    name: "Sid",
    text: "I fixed the null check, reviewing tests now.",
    createdAt: 2,
  },
  msg3: {
    uid: "mock-user-3",
    name: "Mira",
    text: "We should compare the meeting logs too.",
    createdAt: 3,
  },
};

const mockTasks = {
  Player: [
    "Patch the timer bug before the round ends.",
    "Review the chosen snippet for hidden sabotage.",
    "Coordinate with the crew in chat.",
  ],
  Imposter: [
    "Subtly introduce a bug without being noticed.",
    "Redirect suspicion during emergency meetings.",
    "Prevent the crew from shipping working code.",
  ],
};

const mockCode = `function startRound(players) {
  return players
    .filter((player) => player.alive)
    .map((player) => ({
      id: player.uid,
      label: player.name,
      ready: true,
    }));
}

console.log(startRound([]));`;

const mockRoomData = {
  hostId: "mock-user-1",
  gameState: "playing",
  currentRound: 1,
  successfulRounds: 1,
  votingStartedAt: Date.now() - 12000,
  roundStartedAt: Date.now() - 20000,
  meetingStartedAt: Date.now() - 4000,
  meetingReason: "There was sabotage in the latest code run.",
  meetingVotes: {
    "mock-user-1": "mock-user-2",
    "mock-user-2": "skip",
    "mock-user-3": "mock-user-2",
  },
  players: mockPlayers,
  votes: mockVotes,
  topics: mockTopics,
  winner: "bug_hunt",
  codeRunPending: false,
  codeRunReason: null,
  imposterId: "mock-user-2",
  chat: mockChat,
  codestate: {
    language: "javascript",
    code: mockCode,
    tasks: mockTasks,
  },
};

const mockMeetingData = {
  ...mockRoomData,
  gameState: "meeting",
};

function FirebaseRouteShell() {
  return (
    <FirebaseProvider>
      <Outlet />
    </FirebaseProvider>
  );
}

function TestRoutesIndex() {
  const routes = [
    { path: "/test/home", label: "Home Page" },
    { path: "/test/room", label: "Room Lobby" },
    { path: "/test/voting", label: "Voting Page" },
    { path: "/test/role/crew", label: "Role Reveal: Crew" },
    { path: "/test/role/imposter", label: "Role Reveal: Imposter" },
    { path: "/test/game", label: "Gameplay Page" },
    { path: "/test/meeting", label: "Meeting Page" },
    { path: "/test/result", label: "Result Page" },
  ];

  return (
    <SkyBackground>
      <div className="pregame-layout">
        <div className="sky-panel pregame-panel">
          <span className="sky-kicker arcade">Test Routes</span>
          <h1 className="arcade">Page Preview Hub</h1>
          <p className="pregame-copy">
            These routes use prebuilt data only, so you can test screens without touching Firebase.
          </p>

          <div className="vote-topic-list">
            {routes.map((route) => (
              <Link key={route.path} className="vote-topic" to={route.path}>
                <span>{route.label}</span>
                <span>Open route</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </SkyBackground>
  );
}

function TestHomePage() {
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
          <input className="game-input" value="Sid" readOnly />
          <div className="join-row">
            <input className="game-input" value={mockRoomId} readOnly />
            <button className="game-btn mine" type="button">
              Join
            </button>
          </div>
          <button className="game-btn host-btn mine" type="button">
            Host Game
          </button>
        </div>
      </div>
    </SkyBackground>
  );
}

function TestRoomPage() {
  return (
    <SkyBackground>
      <div className="pregame-layout">
        <div className="sky-panel pregame-panel room-page">
          <span className="sky-kicker arcade">Room Lobby</span>
          <h1 className="arcade">Room: {mockRoomId}</h1>
          <p className="pregame-copy">
            Gather the crew, get everyone ready, and let the host kick off voting.
          </p>

          <div className="player-list" role="list" aria-label="Players in room">
            {Object.values(mockPlayers).map((player) => (
              <div key={player.uid} className="player-chip" role="listitem">
                {player.name}
              </div>
            ))}
          </div>

          <div className="pregame-actions">
            <button className="game-btn mine" type="button">
              Start voting
            </button>
          </div>
        </div>
      </div>
    </SkyBackground>
  );
}

function TestVotingPage() {
  const [selectedVote, setSelectedVote] = useState(mockVotes[mockCurrentUserId] || null);
  const votesArray = Object.values(mockVotes);
  const voteCount = (topicId) => votesArray.filter((vote) => vote === topicId).length;

  return (
    <SkyBackground>
      <div className="pregame-layout">
        <div className="sky-panel pregame-panel voting-page">
          <span className="sky-kicker arcade">Pre-Game Vote</span>
          <h1 className="arcade">Vote for a topic</h1>
          <div className="vote-timer">11s</div>

          <div className="vote-topic-list">
            {Object.entries(mockTopics).map(([topicId, topic]) => (
              <button
                key={topicId}
                type="button"
                className={`vote-topic ${selectedVote === topicId ? "selected" : ""}`.trim()}
                onClick={() => setSelectedVote(topicId)}
              >
                <span>{topic.label}</span>
                <span>
                  {voteCount(topicId)} votes
                  {selectedVote === topicId ? " | Your vote" : ""}
                </span>
              </button>
            ))}
          </div>

          <p className="pregame-copy">You can change your vote before time ends.</p>
        </div>
      </div>
    </SkyBackground>
  );
}

function TestGameplayPage() {
  const currentPlayer = mockPlayers[mockCurrentUserId];
  const playerTasks = mockTasks[currentPlayer.role] || [];

  return (
    <div className="editor-layout">
      <div className="editor-sidebar">
        <div className="sky-panel" style={{ minHeight: "100%" }}>
          <h3>Your role</h3>
          <p>{currentPlayer.role === "Player" ? "Crewmate" : currentPlayer.role}</p>
          <p>Status: Alive</p>

          <h3>Your tasks</h3>
          {playerTasks.map((task) => (
            <div key={task}>{task}</div>
          ))}

          <h3>All Players</h3>
          {Object.values(mockPlayers).map((player) => (
            <div key={player.uid}>
              {player.name}
              {player.alive === false ? " | Spectator" : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="editor-main">
        <div
          style={{
            minHeight: "100vh",
            padding: "24px",
            background: "#0d1117",
            color: "#c9d1d9",
            textAlign: "left",
            fontFamily: "ui-monospace, Consolas, monospace",
            overflow: "auto",
          }}
        >
          <h3 style={{ color: "#8b949e" }}>Gameplay Editor Preview</h3>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{mockCode}</pre>
        </div>
      </div>

      <div className="editor-sidebar">
        <div className="sky-panel" style={{ minHeight: "100%" }}>
          <h3>Round 1 / 3</h3>
          <h3>Round timer</h3>
          <p>42s</p>
          <button type="button">Emergency</button>

          <h3>Chat</h3>
          {Object.values(mockChat).map((chat) => (
            <div key={chat.createdAt}>
              <strong>{chat.uid === mockCurrentUserId ? "You" : chat.name}:</strong>{" "}
              <span>{chat.text}</span>
            </div>
          ))}

          <form>
            <input type="text" value="Need one more review on line 12" readOnly />
            <button type="button">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function TestMeetingPage() {
  const alivePlayers = Object.values(mockMeetingData.players).filter(
    (player) => player.alive !== false
  );

  return (
    <SkyBackground>
      <div className="pregame-layout">
        <div className="sky-panel pregame-panel">
          <span className="sky-kicker arcade">Emergency Meeting</span>
          <h1 className="arcade">Discuss and vote</h1>
          <p className="pregame-copy">{mockMeetingData.meetingReason}</p>
          <div className="vote-timer">23s</div>

          <div className="vote-topic-list">
            {alivePlayers.map((player) => (
              <button key={player.uid} type="button" className="vote-topic">
                <span>Vote {player.name}</span>
                <span>
                  {mockMeetingData.meetingVotes[player.uid] ? "Already voted" : "Tap to vote"}
                </span>
              </button>
            ))}

            <button type="button" className="vote-topic">
              <span>Skip vote</span>
              <span>Stay neutral this round</span>
            </button>
          </div>
        </div>
      </div>
    </SkyBackground>
  );
}

function TestResultPage() {
  return (
    <SkyBackground>
      <div className="pregame-layout">
        <div className="sky-panel pregame-panel">
          <span className="sky-kicker arcade">Game Over</span>
          <h1 className="arcade" style={{ color: "#ff6f88" }}>
            Imposter Wins
          </h1>
          <p className="pregame-copy">
            The imposter survived the final meeting and the crew ran out of time.
          </p>
          <div className="player-list">
            <div className="player-chip">Saboteur: Aarav</div>
            <div className="player-chip">Best detective: Sid</div>
          </div>
        </div>
      </div>
    </SkyBackground>
  );
}

const router = createBrowserRouter([
  {
    element: <FirebaseRouteShell />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      {
        path: "/play",
        element: <Test />,
      },
      {
        path: "/rooms/:roomid",
        element: <Room />,
      },
    ],
  },
  {
    path: "/test",
    element: <TestRoutesIndex />,
  },
  {
    path: "/test/home",
    element: <TestHomePage />,
  },
  {
    path: "/test/room",
    element: <TestRoomPage />,
  },
  {
    path: "/test/voting",
    element: <TestVotingPage />,
  },
  {
    path: "/test/role/crew",
    element: <RoleRevealPage role="Player" />,
  },
  {
    path: "/test/role/imposter",
    element: <RoleRevealPage role="Imposter" />,
  },
  {
    path: "/test/game",
    element: <TestGameplayPage />,
  },
  {
    path: "/test/meeting",
    element: <TestMeetingPage />,
  },
  {
    path: "/test/result",
    element: <TestResultPage />,
  },
]);

function App() {
  return (
    <MantineProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </MantineProvider>
  );
}

export default App;
