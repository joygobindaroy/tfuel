import { db } from "./firebase";
import { tgCall, webhookSecret } from "./telegram";
import { BOT_COMMANDS } from "./bot";
import { VERSION } from "./version";
import { sha256 } from "./crypto";

let done = "";

/**
 * After every deploy (new version or changed command list) the first bot update refreshes everything by itself:
 * commands (default scope + the scopes/languages that could hide them), menu button and webhook update types.
 * No need to press "Connect Telegram" again.
 */
export async function ensureBotSynced(host?: string): Promise<void> {
  const key = VERSION + ":" + sha256(JSON.stringify(BOT_COMMANDS)).slice(0, 8);
  if (done === key || !process.env.BOT_TOKEN) return;
  try {
    const cur = (await db().ref("bot_sync/key").get()).val();
    if (cur !== key) {
      const cmds = JSON.stringify(BOT_COMMANDS);
      // old per-scope lists would override the default one, so clear them first
      for (const scope of ["all_private_chats", "all_group_chats", "all_chat_administrators"]) {
        await tgCall("deleteMyCommands", { scope: JSON.stringify({ type: scope }) }).catch(() => {});
      }
      const r = await tgCall("setMyCommands", { commands: cmds });
      if (!r?.ok) return;
      await tgCall("setMyCommands", { commands: cmds, scope: JSON.stringify({ type: "all_private_chats" }) }).catch(() => {});
      await tgCall("setChatMenuButton", { menu_button: JSON.stringify({ type: "commands" }) }).catch(() => {});
      if (host && !/localhost/.test(host)) {
        await tgCall("setWebhook", { url: `https://${host}/api/tg-webhook`, secret_token: webhookSecret(), allowed_updates: JSON.stringify(["message", "pre_checkout_query", "callback_query", "inline_query", "my_chat_member"]), drop_pending_updates: "false" }).catch(() => {});
      }
      await db().ref("bot_sync").set({ key, version: VERSION, at: Date.now() });
    }
    done = key;
  } catch (e) { console.error("bot sync", e); }
}
