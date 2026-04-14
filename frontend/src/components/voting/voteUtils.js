export const getWinningTopic = (votesObj) => {
  if (!votesObj) return null;

  const count = {};

  Object.values(votesObj).forEach((topicId) => {
    count[topicId] = (count[topicId] || 0) + 1;
  });

  let maxVotes = 0;
  let winner = null;

  Object.entries(count).forEach(([topicId, total]) => {
    if (total > maxVotes) {
      maxVotes = total;
      winner = topicId;
    }
  });

  return winner;
};

export const getVoteCount = (votes, topicId) => {
  return votes.filter((vote) => vote === topicId).length;
};

export const getTotalVotes = (votesObj) => {
  return Object.keys(votesObj || {}).length;
};

export const getTotalPlayers = (playersObj) => {
  return Object.keys(playersObj || {}).length;
};
