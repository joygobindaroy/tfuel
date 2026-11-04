import { db } from "./firebase";
export const isBlocked = async (owner: string, other: string) => !!(await db().ref(`user_prefs/${owner}/blk/${other}`).get()).val();
