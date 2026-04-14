import React, { useEffect, useState } from 'react'
import { useFirebase } from '../../context/Firebase';
import { useParams } from 'react-router-dom';
import Coder from './Code';
import Leftpage from './Leftpage.jsx';
import Rightpage from './Rightpage.jsx';
import './EditorLayout.css';

const splitMainSection = (code = "") => {
  const normalizedCode = String(code || "");
  const match = normalizedCode.match(/^[ \t]*int\s+main\s*\(/m);

  if (!match) {
    return { editorCode: normalizedCode, hiddenMain: "" };
  }

  const startIndex = match.index;
  return {
    editorCode: normalizedCode.slice(0, startIndex).replace(/[\s\n]*$/u, "") + "\n",
    hiddenMain: normalizedCode.slice(startIndex),
  };
};

export default function Index({data}) {
  const { currentUser, getcode } = useFirebase()
  const [editorCode, setEditorCode] = useState("");
  const [hiddenMain, setHiddenMain] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [taskData, setTaskData] = useState(null);
  const { roomid } = useParams()
  const isAlive = currentUser?.uid ? data?.players?.[currentUser.uid]?.alive !== false : true;
  const canEdit = data?.gameState === "playing" && isAlive && !data?.codeRunPending;

  useEffect(() => {
    if (!data?.winner) {
      setTaskData(null);
      return;
    }

    const fetchcode = async () => {
      const hasCode = typeof data?.codestate?.code === "string" && data.codestate.code.trim().length > 0;
      const hasTaskData = taskData !== null;

      if (hasCode && hasTaskData) return;

      const val = await getcode(roomid);

      if (!val) return;

      const { editorCode: displayCode, hiddenMain: mainSuffix } = splitMainSection(val.code || "");
      setEditorCode(displayCode);
      setHiddenMain(mainSuffix);
      setLanguage(val.language || "javascript");
      setTaskData(val.taskData || null);
    };

    fetchcode();
  }, [data?.winner, data?.codestate?.code, getcode, roomid, taskData]);

  useEffect(() => {
    if (typeof data?.codestate?.code === "string") {
      const { editorCode: displayCode, hiddenMain: mainSuffix } = splitMainSection(data.codestate.code);
      setEditorCode(displayCode);
      setHiddenMain(mainSuffix);
    }

    if (data?.codestate?.language) {
      setLanguage(data.codestate.language);
    }
  }, [data?.codestate?.code, data?.codestate?.language]);

  return (
      <div className="editor-layout">
      <div className="editor-sidebar">
        <Leftpage data={data} taskData={taskData}/>
      </div>
      <div className="editor-main">
        <Coder code={editorCode} setCode={setEditorCode} language={language} hiddenSuffix={hiddenMain} readOnly={!canEdit}></Coder>
      </div>
      <div className="editor-sidebar">
        <Rightpage data= {data}/>
      </div>
    </div>
  )
}
 
