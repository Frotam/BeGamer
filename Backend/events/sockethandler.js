const eventBus = require("./event");
const { rooms } = require("../roomsStore");
const { joinRoom } = require("../Roomactions/Basicactions");

// eventBus.on("Room_created", async (event) => {
//   const { roomId, state, userId, username, ws, attachSocketToRoom } = event;

//   rooms[roomId] = { sockets: [], state };
//   ws.username = username;
//   ws.userId = userId;
//   ws.user.uid = userId;

//   attachSocketToRoom(roomId, ws);
//   await joinRoom(roomId, userId, username);
// });
