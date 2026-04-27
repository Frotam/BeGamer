import React, { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useParams } from "react-router-dom";
import { useSocket } from "../../context/Socketcontext";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";

const sanitizeClassName = (uid) =>
  `cursor-glyph-${String(uid).replace(/[^a-z0-9_-]/gi, "-")}`;

const ensureCursorStyle = (className, colors) => {
  if (typeof document === "undefined") return;
  if (document.getElementById(className)) return;

  if (!Array.isArray(colors)) {
    colors = [String(colors || "#888")];
  }

  const style = document.createElement("style");
  style.id = className;

  const isMulti = colors.length > 1;
  const background = isMulti
    ? `linear-gradient(135deg, ${colors.join(", ")})`
    : colors[0];

  style.textContent = `
    .monaco-editor .${className} {
      display: inline-block !important;
      background: ${background} !important;
      width: ${isMulti ? 12 : 10}px !important;
      height: ${isMulti ? 12 : 10}px !important;
      border-radius: ${isMulti ? "4px" : "50%"} !important;
      margin: 0 0 0 4px !important;
      border: 1px solid rgba(255, 255, 255, 0.18) !important;
      box-sizing: border-box !important;
    }
  `;
  document.head.appendChild(style);
};

function Code({
  language,
  readOnly,
  playerCursors = {},
  players = {},
  onEditorValueChange,
}) {
  const { isConnected, sendMessage, on, off } = useSocket();
  const { roomid } = useParams();
  const [hasYjsState, setHasYjsState] = useState(false);
  const [isEditorMounted, setIsEditorMounted] = useState(false);
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const cursorTimeoutRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const isConnectedRef = useRef(isConnected);
  const readOnlyRef = useRef(readOnly);
  const decorationIdsRef = useRef([]);
  const lastCursorRef = useRef({ line: null, column: null });

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    return () => {
      clearTimeout(cursorTimeoutRef.current);
      providerRef.current?.destroy?.();
      ydocRef.current?.destroy();
    };
  }, []);

  const getPlayerColor = (uid) => {
    const assigned = players?.[uid]?.color;
    if (assigned) return assigned;

    let hash = 0;
    for (let i = 0; i < uid.length; i += 1) {
      hash = (hash << 5) - hash + uid.charCodeAt(i);
      hash |= 0;
    }

    const palette = [
      "#f97316",
      "#14b8a6",
      "#8b5cf6",
      "#ec4899",
      "#22c55e",
      "#0ea5e9",
      "#f59e0b",
      "#ef4444",
      "#0f766e",
      "#7c3aed",
    ];

    return palette[Math.abs(hash) % palette.length];
  };

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const lineColors = Object.entries(playerCursors || {}).reduce(
      (map, [uid, cursor]) => {
        const line = Number(cursor?.line);
        if (!line || line < 1) return map;

        const color = getPlayerColor(uid);
        if (!map[line]) map[line] = new Set();
        map[line].add(color);
        return map;
      },
      {}
    );

    const decorations = Object.entries(lineColors).map(([line, colorsSet]) => {
      const colors = Array.from(colorsSet);
      const className = sanitizeClassName(`line-${line}-${colors.join("_")}`);
      ensureCursorStyle(className, colors);

      return {
        range: new monacoRef.current.Range(Number(line), 1, Number(line), 1),
        options: {
          glyphMarginClassName: className,
          linesDecorationsClassName: className,
        },
      };
    });

    decorationIdsRef.current = editorRef.current.deltaDecorations(
      decorationIdsRef.current,
      decorations
    );
  }, [playerCursors, players]);

  const requestYjsState = () => {
    if (!ydocRef.current || !isConnectedRef.current || !roomid) return;

    try {
      sendMessage({
        type: "request-yjs-state",
        roomId: roomid,
      });
    } catch {
      // The socket can close between the readiness check and send.
    }
  };

  const handleMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    setIsEditorMounted(true);

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const yText = ydoc.getText("monaco");

    providerRef.current = new MonacoBinding(
      yText,
      editorInstance.getModel(),
      new Set([editorInstance]),
      ydoc.awareness
    );

    onEditorValueChange?.(editorInstance.getValue() || "");

    editorInstance.onDidChangeModelContent(() => {
      onEditorValueChange?.(editorInstance.getValue() || "");
    });

    editorInstance.onDidChangeCursorPosition((event) => {
      if (readOnlyRef.current) return;
      if (!event?.position) return;

      const line = event.position.lineNumber;
      const column = event.position.column;

      if (
        lastCursorRef.current.line === line &&
        lastCursorRef.current.column === column
      ) {
        return;
      }

      lastCursorRef.current = { line, column };
      clearTimeout(cursorTimeoutRef.current);
      cursorTimeoutRef.current = setTimeout(() => {
        if (!isConnectedRef.current) return;

        try {
          sendMessage({
            type: "updateCursor",
            roomId: roomid,
            line,
            column,
          });
        } catch {
          // The socket can close between the readiness check and send.
        }
      }, 200);
    });

    ydoc.on("update", (update, origin) => {
      if (origin === "remote") return;
      if (!isConnectedRef.current) return;

      try {
        sendMessage({
          type: "yjs-update",
          roomId: roomid,
          update: Array.from(update),
        });
      } catch {
        // The socket can close between the readiness check and send.
      }
    });

  };

  useEffect(() => {
    const handleUpdate = (msg) => {
      if (!ydocRef.current || (msg.roomId && msg.roomId !== roomid)) return;

      const update = Uint8Array.from(msg.update);
      Y.applyUpdate(ydocRef.current, update, "remote");
      setHasYjsState(true);
    };

    const handleInit = (msg) => {
      if (!ydocRef.current || (msg.roomId && msg.roomId !== roomid)) return;

      const update = Uint8Array.from(msg.update);
      Y.applyUpdate(ydocRef.current, update, "remote");
      setHasYjsState(true);
    };

    on("yjs-update", handleUpdate);
    on("yjs-init", handleInit);

    return () => {
      off("yjs-update", handleUpdate);
      off("yjs-init", handleInit);
    };
  }, [on, off, roomid]);

  useEffect(() => {
    setHasYjsState(false);
    requestYjsState();
  }, [isConnected, roomid, isEditorMounted]);

  return (
    <Editor
      height="100%"
      defaultValue=""
      language={language}
      theme="vs-dark"
      onMount={handleMount}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        readOnly: readOnly || !hasYjsState,
        glyphMargin: true,
        formatOnPaste: false,
        formatOnType: false,
      }}
    />
  );
}

export default Code;
