import { getVoteCount } from "./voteUtils";

function VotingTopicList({
  topics,
  votes,
  currentVote,
  isVotingOpen,
  onVote,
}) {
  return (
    <div className="vote-topic-list">
      {Object.entries(topics).map(([topicId, topic]) => {
        const voteCount = getVoteCount(votes, topicId);

        return (
          <button
            key={topicId}
            className={`vote-topic mine  ${currentVote === topicId ? "selected" : ""}`.trim()   }  
            disabled={!isVotingOpen}
            onClick={() => onVote(topicId)}
          >
            <span>{topic.label}</span>
            <span>
              {voteCount} vote
              {voteCount === 1 ? "" : "s"}
              {currentVote === topicId ? " | Your vote" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default VotingTopicList;
