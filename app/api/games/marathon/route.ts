import { json, readBody, renewSessionHeaders, sameOrigin } from "@/lib/server";
import { marathonSnapshot, parseMarathonRequest, readMarathonContext, waterMarathon } from "@/lib/games/marathon-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const context = await readMarathonContext(req);
    if (!context) return json({ error: "チーム画面でログインしてから遊んでください。" }, 401);
    return json(marathonSnapshot(context), 200, renewSessionHeaders(req));
  } catch (error) {
    console.error("[marathon:GET]", error);
    return json({ error: "小林の様子を読み込めませんでした。少し待ってから再試行してください。" }, 503);
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "リクエストを確認できません。" }, 403);
  try {
    let request;
    try { request = parseMarathonRequest(await readBody(req)); }
    catch { return json({ error: "給水の操作を確認してください。" }, 400); }
    if (!request) return json({ error: "給水の操作を確認してください。" }, 400);
    const context = await readMarathonContext(req);
    if (!context) return json({ error: "チーム画面でログインし直してください。" }, 401);
    const result = await waterMarathon(req, context, request);
    if (!result.context) return json({ error: "チーム画面でログインし直してください。" }, 401);
    const snapshot = marathonSnapshot(result.context);
    const headers = renewSessionHeaders(req);
    if (result.status === "conflict") return json({ error: "ひと足先に誰かが給水しました。小林の最新の様子に更新しました。", snapshot }, 409, headers);
    if (result.status === "waiting") return json({ error: "小林はまだおなかいっぱいです。少し待ってから給水してください。", snapshot }, 409, headers);
    return json(snapshot, 200, headers);
  } catch (error) {
    console.error("[marathon:POST]", error);
    return json({ error: "給水結果を確認できませんでした。同じ給水を再試行してください。" }, 503);
  }
}
