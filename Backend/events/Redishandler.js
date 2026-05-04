const { syncRoomStateToRedis } = require("../Roomactions/roomStateStore");
const eventBus = require("./event");

eventBus.on("Room_created", (event) => {
  void syncRoomStateToRedis(event.roomId, event.state, {
    updateUserMappings: true,
  }).catch((error) => {
    console.error("Room_created redis sync failed:", error);
  });
});
