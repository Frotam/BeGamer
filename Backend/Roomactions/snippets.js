const snippets = {
  "backend(Js)": {
    language: "javascript",
    code: `function buildStatusResponse(name) {
  // START_EDIT_GREETING
  const greeting = \`Player: \${name}\`;
  // END_EDIT_GREETING

  return greeting;
}

console.log(buildStatusResponse("Crew"));
`,
    lockedRanges: ["function buildStatusResponse(name) {", "return greeting;", "}"],
    tasks: {
      player: {
        instructions: [
          "Make the function print the expected crew status line.",
          "Do not rename the function.",
        ],
        expectedOutput: "Player: Crew",
      },
      imposter: {
        instructions: [
          "Change the editable logic so the output matches the sabotage target.",
          "Keep the program runnable.",
        ],
        expectedOutput: "Player: Imposter",
      },
    },
  },
  "dsa(Cpp)": {
    language: "cpp",
    code: `#include <iostream>
using namespace std;

int solve() {
  // START_EDIT_RETURN
  return 6;
  // END_EDIT_RETURN
}

int main() {
  cout << solve() << endl;
  return 0;
}
`,
    lockedRanges: ["int solve() {", "int main() {", "cout << solve() << endl;", "return 0;", "}"],
    tasks: {
      player: {
        instructions: [
          "Return the correct answer for the crew target.",
          "Keep main unchanged.",
        ],
        expectedOutput: "6",
      },
      imposter: {
        instructions: [
          "Make the solution return the sabotage value without breaking compilation.",
        ],
        expectedOutput: "9",
      },
    },
  },
  "dsa(Py)": {
    language: "python",
    code: `def solve():
    # START_EDIT_RETURN
    return "ready"
    # END_EDIT_RETURN

print(solve())
`,
    lockedRanges: ["def solve():", "print(solve())"],
    tasks: {
      player: {
        instructions: [
          "Return the expected crew status.",
          "Keep the function name the same.",
        ],
        expectedOutput: "ready",
      },
      imposter: {
        instructions: [
          "Return the sabotage status while keeping the file runnable.",
        ],
        expectedOutput: "sabotaged",
      },
    },
  },
};

const fetchSnippetByTopic = async (topicId) => {
  const snippet = snippets[topicId];

  if (!snippet) {
    throw new Error(`Snippet not found for topic "${topicId}".`);
  }

  return snippet;
};

module.exports = {
  fetchSnippetByTopic,
  snippets,
};
