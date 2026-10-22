import type { AdminMod } from "./types";
import people from "./people";
import ops from "./ops";
import insights from "./insights";
import comms from "./comms";
import controls from "./controls";

export const ADMIN_MODS: AdminMod[] = [people, ops, insights, comms, controls];
