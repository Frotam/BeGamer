import { createBasicRoomActions } from "./basicActions.js";
import { createGameActions } from "./gameActions.js";

export const createRoomActions = (deps) => {
  return {
    ...createBasicRoomActions(deps),
    ...createGameActions(deps),
  };
};
