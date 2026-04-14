import React, { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { useParams } from "react-router-dom";
import { useFirebase } from "../../context/Firebase";
import { normalizeStoredCode } from "../../context/roomActions/utils.js";

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
  const background =
    isMulti
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
  code,
  setCode,
  language,
  hiddenSuffix = "",
  readOnly,
  playerCursors = {},
  players = {},
}) {
  const { updatecode, updatecursor } = useFirebase();
  const { roomid } = useParams();

  const timeoutRef = useRef(null);
  const cursorTimeoutRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationIdsRef = useRef([]);
  const lastCursorRef = useRef({ line: null, column: null });

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
      clearTimeout(cursorTimeoutRef.current);
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

  const handleMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;

    if (!editorInstance) return;

    editorInstance.onDidChangeCursorPosition((event) => {
      if (readOnly) return;
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
        updatecursor(roomid, { line, column }).catch(() => {});
      }, 200);
    });
  };

  const handleChange = (val = "") => {
    if (readOnly) return;

    const normalizedEditorCode = normalizeStoredCode(val);
    setCode(normalizedEditorCode);

    const normalizedCode = hiddenSuffix
      ? `${normalizedEditorCode}${hiddenSuffix}`
      : normalizedEditorCode;

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      updatecode(roomid, normalizedCode);
    }, 400);
  };

  return (
    <Editor
      height="100%"
      language={language}
      value={code}
      theme="vs-dark"
      onMount={handleMount}
      onChange={handleChange}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        readOnly,
        glyphMargin: true,
        formatOnPaste: false,
        formatOnType: false,
      }}
    />
  );
}

export default Code;
