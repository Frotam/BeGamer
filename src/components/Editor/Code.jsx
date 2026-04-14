import React from "react";
import Editor from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useFirebase } from "../../context/Firebase";
import { normalizeStoredCode } from "../../context/roomActions/utils.js";

function Code({
  code,
  setCode,
  language,
  hiddenSuffix = "",
  readOnly
}) {

  const { updatecode } = useFirebase();
  const { roomid } = useParams();

  const timeoutRef = useRef(null);
  const editorRef = useRef(null);


  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);


  const handleMount = (editorInstance) => {
    editorRef.current = editorInstance;
  };

  const handelchange = (val = "") => {
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
      onChange={handelchange}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        readOnly,

        formatOnPaste: false,
        formatOnType: false
      }}
    />

  );

}

export default Code;