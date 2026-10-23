import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { sortableId } from "@/lib/crypto";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { requireFeature } from "@/lib/features";
import { getCfg2 } from "@/lib/cfg2";
import { tierInfo, refBoard } from "@/lib/growth2";
import { commissionBase } from "@/lib/user";
import { clanView, clanCreate, clanJoin, clanLeave, clanKick, bossClaim } from "@/lib/clan";
import { rigsView, rigBuy, rigCollect } from "@/lib/rigs";
import { puzzleView, puzzleGuess } from "@/lib/puzzle";
import { collectView, collectBuy } from "@/lib/collect";
import { alertAdmins } from "@/lib/adminalert";

const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n);

/** v18 user actions: invite tiers/board, auto-convert, clans + raid boss, mining rigs, word puzzle, collectibles, report a problem */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "more", 40);
  const { u, settings: s } = await ensureUser(user);
  const b = req.body || {};
  const a = String(b.action || "");
  const cfg = await getCfg2();
  const ok = (o: Record<string, any> = {}) => res.json({ success: true, ...o });

  switch (a) {
    case "invite": {
      const info = tierInfo(cfg.tiers, u.ref_count || 0, s.referral_commission_pct);
      return ok({ tier: info, board: await refBoard(user.id, "w", s) });
    }
    case "refBoard": return ok({ board: await refBoard(user.id, b.board === "all" ? "all" : "w", s) });

    case "acSet": {
      requireFeature(s, "autoconv");
      if (!cfg.autoconv.enabled) throw new HttpError(403, "feature_off");
      const pct = Math.floor(Number(b.pct) || 0);
      if (pct !== 0 && !cfg.autoconv.options.includes(pct)) throw new HttpError(400, "bad_request");
      await db().ref(`users/${user.id}`).update({ ac_pct: pct || null, ac_base: commissionBase(u.earn), ac_at: Date.now() });
      return ok({ pct, options: cfg.autoconv.options });
    }
    case "acGet": return ok({ enabled: cfg.autoconv.enabled && s.trade_enabled && s.sell_enabled, options: cfg.autoconv.options, pct: Number((u as any).ac_pct) || 0, total: Number((u as any).ac_total) || 0 });

    case "clan": requireFeature(s, "clans"); return ok({ clan: await clanView(user.id) });
    case "clanCreate": requireFeature(s, "clans"); await clanCreate(user.id, b.name, b.tag); return ok({ clan: await clanView(user.id) });
    case "clanJoin": requireFeature(s, "clans"); await clanJoin(user.id, String(b.id || "")); return ok({ clan: await clanView(user.id) });
    case "clanLeave": requireFeature(s, "clans"); await clanLeave(user.id); return ok({ clan: await clanView(user.id) });
    case "clanKick": requireFeature(s, "clans"); await clanKick(user.id, String(b.uid || "")); return ok({ clan: await clanView(user.id) });
    case "bossClaim": { requireFeature(s, "clans"); const reward = await bossClaim(user.id); return ok({ reward, clan: await clanView(user.id) }); }

    case "rigs": requireFeature(s, "rigs"); return ok({ rigs: await rigsView(user.id) });
    case "rigBuy": requireFeature(s, "rigs"); await rigBuy(user.id, String(b.id || "")); return ok({ rigs: await rigsView(user.id) });
    case "rigCollect": { requireFeature(s, "rigs"); const amount = await rigCollect(user.id); return ok({ amount, rigs: await rigsView(user.id) }); }

    case "puzzle": requireFeature(s, "puzzle"); return ok({ puzzle: await puzzleView(user.id) });
    case "puzzleGuess": requireFeature(s, "puzzle"); return ok(await puzzleGuess(user.id, b.guess));

    case "collect": requireFeature(s, "collectibles"); return ok({ collect: await collectView(user.id) });
    case "collectBuy": requireFeature(s, "collectibles"); await collectBuy(user.id, String(b.id || "")); return ok({ collect: await collectView(user.id) });

    case "report": {
      const cat = ["Deposit", "Withdrawal", "Tasks / articles", "Wallet / balance", "Login / account", "Other"].includes(b.category) ? b.category : "Other";
      const msg = clean(b.message, 900);
      if (msg.length < 10) throw new HttpError(400, "bad_request");
      const idx = `user_tickets/${user.id}`;
      const mine = Object.values(((await db().ref(idx).get()).val() || {}) as Record<string, any>);
      if (mine.filter((t) => t.status !== "closed").length >= 3) throw new HttpError(429, "ticket_limit");
      const d = (b.diag || {}) as any;
      const diag = `\n\n— Auto-attached —\nApp v${clean(d.v, 12)} · ${clean(d.ua, 120)} · screen ${clean(d.scr, 20)} · last error: ${clean(d.err, 80) || "none"}`;
      const id = sortableId();
      const now = Date.now();
      const subject = `[Problem] ${cat}`;
      await db().ref().update({
        [`tickets/${id}`]: { uid: user.id, name: user.first_name || "User", subject, status: "open", kind: "bug", created_at: now, updated_at: now, msgs: { [sortableId()]: { f: "user", t: msg + diag, at: now } } },
        [`${idx}/${id}`]: { subject, status: "open", updated_at: now },
      });
      await alertAdmins("ticket", `Problem report from ${user.first_name || "User"}: ${cat}`);
      return ok({ id });
    }
    default: throw new HttpError(400, "bad_request");
  }
});
