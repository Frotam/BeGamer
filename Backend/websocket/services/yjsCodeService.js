const createYjsCodeService = ({ rooms, yDocs, normalizeStoredCode, Y }) => {
  const splitMainSection = (code = "") => {
    const normalizedCode = String(code || "");
    const match = normalizedCode.match(/^[ \t]*int\s+main\s*\(/m);

    if (!match) {
      return { editorCode: normalizedCode, hiddenMain: "" };
    }

    const startIndex = match.index;

    return {
      editorCode: `${normalizedCode.slice(0, startIndex).replace(/[\s\n]*$/u, "")}\n`,
      hiddenMain: normalizedCode.slice(startIndex),
    };
  };

  const getYDoc = (roomId) => {
    if (!yDocs[roomId]) {
      const doc = new Y.Doc();
      const roomObj = rooms[roomId];
      const initialCode = splitMainSection(
        roomObj?.state?.codestate?.code || "",
      ).editorCode;
      const yText = doc.getText("monaco");

      if (initialCode) {
        yText.insert(0, initialCode);
      }

      yDocs[roomId] = doc;
    }

    return yDocs[roomId];
  };

  const replaceYDocTextFromRoom = (roomId) => {
    const roomObj = rooms[roomId];

    if (!roomObj) {
      return null;
    }

    const doc = getYDoc(roomId);
    const yText = doc.getText("monaco");
    const nextEditorCode = splitMainSection(
      roomObj.state?.codestate?.code || "",
    ).editorCode;

    doc.transact(() => {
      yText.delete(0, yText.length);

      if (nextEditorCode) {
        yText.insert(0, nextEditorCode);
      }
    });

    return doc;
  };

  const persistRoomCodeFromYDoc = (roomId, fullCode) => {
    const roomObj = rooms[roomId];

    if (!roomObj?.state?.codestate) {
      return;
    }

    const normalizedFullCode =
      typeof fullCode === "string" ? normalizeStoredCode(fullCode) : null;

    if (normalizedFullCode !== null) {
      roomObj.state.codestate.code = normalizedFullCode;
    } else {
      const yText = getYDoc(roomId).getText("monaco");
      const { hiddenMain } = splitMainSection(roomObj.state.codestate.code || "");
      roomObj.state.codestate.code = normalizeStoredCode(
        `${yText.toString()}${hiddenMain}`,
      );
    }

    roomObj.state.codestate.updatedAt = Date.now();
  };

  const getFullCodeFromYDoc = (roomId) => {
    const roomObj = rooms[roomId];

    if (!roomObj?.state?.codestate) {
      return "";
    }

    const yText = getYDoc(roomId).getText("monaco");
    const { hiddenMain } = splitMainSection(roomObj.state.codestate.code || "");

    return normalizeStoredCode(`${yText.toString()}${hiddenMain}`);
  };

  const persistSubmittedCodeForRun = (roomId, code) => {
    const room = rooms[roomId]?.state;

    if (!room || room.codeRunPending) {
      return;
    }

    persistRoomCodeFromYDoc(roomId, code);

    if (typeof code === "string") {
      replaceYDocTextFromRoom(roomId);
    }
  };

  return {
    getYDoc,
    getFullCodeFromYDoc,
    persistRoomCodeFromYDoc,
    persistSubmittedCodeForRun,
    replaceYDocTextFromRoom,
  };
};

module.exports = {
  createYjsCodeService,
};
