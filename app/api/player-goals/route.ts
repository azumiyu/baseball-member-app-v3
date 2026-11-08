import { getSession, json, readBody, renewSessionHeaders, sameOrigin } from "@/lib/server";
import {
  createPlayerGoal,
  deletePlayerGoal,
  PlayerGoalError,
  readPlayerGoals,
  updatePlayerGoal,
} from "@/lib/player-goals-store";
import { parsePlayerGoalInput } from "@/lib/player-goals";
import { teamsOneCurrentYear } from "@/lib/teamsone-batters";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    if (!session?.member) return json({ error: "チーム画面でログインしてからご利用ください。" }, 401);
    const yearValue = new URL(req.url).searchParams.get("year");
    const year = yearValue === null ? teamsOneCurrentYear() : Number(yearValue);
    const result = await readPlayerGoals(req, year);
    return json(result, 200, renewSessionHeaders(req));
  } catch (error) {
    if (error instanceof PlayerGoalError) return json({ error: error.message }, error.status);
    console.error("[player-goals:GET]", error);
    return json({ error: "個人目標を読み込めませんでした。" }, 503);
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "リクエストを確認できません。" }, 403);
  try {
    const session = await getSession(req);
    if (!session?.member) return json({ error: "チーム画面でログインし直してください。" }, 401);
    let body: unknown;
    try { body = await readBody(req); }
    catch { return json({ error: "目標の入力を確認してください。" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "目標の入力を確認してください。" }, 400);
    const input = body as Record<string, unknown>;
    if (input.action === "create") {
      const goal = parsePlayerGoalInput(input.goal);
      const playerId = typeof input.playerId === "string" ? input.playerId : "";
      const year = input.year;
      if (!goal || !playerId || !Number.isInteger(year)) return json({ error: "目標の入力を確認してください。" }, 400);
      const id = await createPlayerGoal(session.member, playerId, year as number, goal);
      return json({ ok: true, id }, 200, renewSessionHeaders(req));
    }
    if (input.action === "update") {
      const goal = parsePlayerGoalInput(input.goal);
      const id = typeof input.id === "string" && /^[a-f0-9]{1,100}$/i.test(input.id) ? input.id : "";
      if (!goal || !id) return json({ error: "目標の入力を確認してください。" }, 400);
      await updatePlayerGoal(session.member, id, goal);
      return json({ ok: true }, 200, renewSessionHeaders(req));
    }
    if (input.action === "delete") {
      const id = typeof input.id === "string" && /^[a-f0-9]{1,100}$/i.test(input.id) ? input.id : "";
      if (!id) return json({ error: "削除する目標を確認してください。" }, 400);
      await deletePlayerGoal(session.member, id);
      return json({ ok: true }, 200, renewSessionHeaders(req));
    }
    return json({ error: "操作を確認してください。" }, 400);
  } catch (error) {
    if (error instanceof PlayerGoalError) return json({ error: error.message }, error.status);
    console.error("[player-goals:POST]", error);
    return json({ error: "個人目標を保存できませんでした。" }, 503);
  }
}
