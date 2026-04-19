
# BeGamer - Coder's AmongUs <img width="50" height="50" alt="pixel fire" src="https://github.com/user-attachments/assets/556b6753-5067-472f-8907-b37767182f3b" />
BeGamer is a real-time multiplayer coding game where players collaboratively solve programming challenges while identifying an imposter attempting to sabotage the solution.
The system combines **real-time state synchronization**, **secure code execution**, and **game theory mechanics** to create a competitive collaborative coding environment.
# Core Concept

Players join a room and are assigned roles:

Crewmates  
Work together to produce correct program output.

Imposter  
Attempts to subtly modify logic to produce incorrect output without being detected.

Players must analyze behaviour, outputs, and voting patterns to identify the imposter.
## System Architecture
<img width="1448" height="720" alt="mermaid-diagram" src="https://github.com/user-attachments/assets/b0e1a32b-a75d-4e7e-9215-5fdcd943d32c" />

## Multiplayer Game State Machine
(Represents game lifecycle transitions.)
<img width="664" height="1164" alt="mermaid-diagram (2)" src="https://github.com/user-attachments/assets/1fd885c5-81fc-4eea-a53b-f1c771ec48de" />

## Internal Design 
<img width="2647" height="2493" alt="mermaid-diagram (3)" src="https://github.com/user-attachments/assets/031556d2-a8c5-46a1-8abf-1412c96371b9" />

## Sequence Diagram
(Real-time interaction between services.)
<img width="2100" height="1518" alt="mermaid-diagram (4)" src="https://github.com/user-attachments/assets/279d9d78-94ca-4ca1-9fa3-daa7b7cde156" />


## Code Execution 
<img width="3873" height="129" alt="mermaid-diagram (5)" src="https://github.com/user-attachments/assets/fafb2300-18a9-4c26-a8d7-d5308ece62a9" />

## Game Flow

1. Lobby  
Players create or join a room.

2. Voting Phase  
Players vote on a coding challenge topic.

3. Playing Phase (120 seconds)  
Players collaboratively write code.

4. Code Execution  
Code is compiled and executed in a sandboxed environment.

5. Result Evaluation  
Outputs are compared with expected results.

6. Meeting Phase (if ambiguous)  
Players discuss and vote to eliminate a suspected imposter.

7. Spectator Mode  
Eliminated players observe the remaining rounds.

8. Auto Reset  
Game resets to lobby after 5 seconds.

## Key Data Flow

Code Execution Flow:

Frontend sends C++ code to backend.

Backend compiles code using g++.

Executable runs inside isolated temp directory.

Output is captured and returned as JSON.

Frontend compares output with expected values for Crewmate and Imposter.

Game winner determined based on output match.

Real-time Sync Flow:

Host performs action.

Firebase updates shared game state.

All players receive updates via listeners.

UI re-renders automatically.


## Tech Stack

Frontend
React
Vite

Realtime Database
Firebase Realtime Database

Authentication
Firebase Auth

Backend
Node.js
Express

Compiler
g++

## Challenges Solved

secure execution of user code

real-time multiplayer state synchronization

handling race conditions between players

sandboxing compiler execution

managing voting consistency

maintaining state integrity across clients

preventing file conflicts during concurrent execution

## Future Improvements

Docker sandbox for enhanced security

support for multiple programming languages

hidden test cases

execution queue for scaling

improved cheat detection

match replay system

performance optimization for high concurrency
