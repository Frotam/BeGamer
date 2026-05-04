const { recordRoomCreated } = require("../Roomactions/roomStateStore");
const eventBus = require("./event");

eventBus.on("Room_created", () => {
  void recordRoomCreated().catch((error) => {
    console.error("Room_created metrics update failed:", error);
  });
});
