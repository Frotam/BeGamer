import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Coder from "./Code";
import Leftpage from "./Leftpage.jsx";
import Rightpage from "./Rightpage.jsx";
import "./EditorLayout.css";
import { useSessionUser } from "../../context/sessionUser";

const splitMainSection = (code = "") => {
  const normalizedCode = String(code || "");
  const match = normalizedCode.match(/^[ \t]*int\s+main\s*\(/m);

  if (!match) {
    return { editorCode: normalizedCode, hiddenMain: "" };
  }

  const startIndex = match.index;

  return {
    editorCode:
      normalizedCode.slice(0, startIndex).replace(/[\s\n]*$/u, "") + "\n",
    hiddenMain: normalizedCode.slice(startIndex),
  };
};

export default function Index({ data }) {
  const currentUser = useSessionUser();
  const { roomid } = useParams();

  const [editorCode, setEditorCode] = useState("");
  const [hiddenMain, setHiddenMain] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [taskData, setTaskData] = useState(null);
  const editorCodeRef = useRef("");
  const hiddenMainRef = useRef("");
  const liveEditorCodeRef = useRef("");

  const isAlive = currentUser?.uid
    ? data?.players?.[currentUser.uid]?.alive !== false
    : true;

  const canEdit =
    data?.gameState === "playing" && isAlive && !data?.codeRunPending;

  useEffect(() => {
    editorCodeRef.current = editorCode;
  }, [editorCode]);

  useEffect(() => {
    hiddenMainRef.current = hiddenMain;
  }, [hiddenMain]);

  const getLiveFullCode = () => {
    return `${liveEditorCodeRef.current}${hiddenMainRef.current}`;
  };

  useEffect(() => {
    const codestate = data?.codestate;
    
    if (!codestate) return;
    
    const { code, language, tasks } = codestate;
    // console.log(code );

    if (typeof code === "string") {
      const localFullCode = `${editorCodeRef.current}${hiddenMainRef.current}`;

      // Ignore socket echoes of our current buffer so Monaco keeps the caret stable.
      if (code !== localFullCode) {
        const { editorCode: displayCode, hiddenMain: mainSuffix } =
          splitMainSection(code);

        setEditorCode(displayCode);
        setHiddenMain(mainSuffix);
      }
    }

    if (language) {
      setLanguage(language);
    }

    setTaskData(tasks);
  }, [data?.codestate]);

  return (
    <div className="editor-layout">
      <div className="editor-sidebar">
        <Leftpage data={data} taskData={taskData} />
      </div>

      <div className="editor-main">
        <Coder
          code={editorCode}
          setCode={setEditorCode}
          language={language}
          hiddenSuffix={hiddenMain}
          readOnly={!canEdit}
          playerCursors={data?.codestate?.playersCursor || {}}
          players={data?.players || {}}
          onEditorValueChange={(value) => {
            liveEditorCodeRef.current = value;
          }}
        />
      </div>

      <div className="editor-sidebar">
        <Rightpage data={data} getLiveFullCode={getLiveFullCode} />
      </div>
    </div>
  );
}
