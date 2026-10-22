import type { AdminMod } from "./types";

/** Admin actions for this area. Return a JSON object to answer, or undefined when the action is not handled here. */
const mod: AdminMod = async (action, b, ctx) => {
  void b; void ctx;
  switch (action) {
    default:
      return undefined;
  }
};
export default mod;
