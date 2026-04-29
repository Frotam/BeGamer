const createCodeReviewService = ({ rooms, executeCodeAndResolve, broadcastRoomState }) => {
  const activeCodeReviews = new Set();

  const getReviewSnippetFromRoom = (room) => {
    const tasks = room?.codestate?.tasks;

    if (!tasks?.player || !tasks?.imposter) {
      throw new Error("Stored task data is missing for this room.");
    }

    return { tasks };
  };

  const runServerCodeReview = async (roomId) => {
    if (!roomId || activeCodeReviews.has(roomId)) {
      return;
    }

    activeCodeReviews.add(roomId);

    try {
      const room = rooms[roomId]?.state;

      if (!room || room.gameState !== "playing" || !room.codeRunPending) {
        return;
      }

      console.log(`[CODE_REVIEW] Starting review for room ${roomId}`);
      const snippet = getReviewSnippetFromRoom(room);
      await executeCodeAndResolve(roomId, null, snippet);
      broadcastRoomState(roomId);
    } catch (error) {
      const room = rooms[roomId]?.state;

      if (room) {
        room.codeRunPending = false;
        room.codeRunRequestedAt = null;
        room.codeRunReason = null;
        room.gameState = "meeting";
        room.resultMessage = null;
        room.meetingStartedAt = Date.now();
        room.meetingVotes = {};
        room.meetingReason = `Code review could not run: ${error.message}`;
      }

      broadcastRoomState(roomId);
      console.error(`Code review failed for room ${roomId}:`, error);
    } finally {
      activeCodeReviews.delete(roomId);
    }
  };

  return {
    runServerCodeReview,
  };
};

module.exports = {
  createCodeReviewService,
};
