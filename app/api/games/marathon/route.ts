import { json, readBody, renewSessionHeaders, sameOrigin } from "@/lib/server";
import {
  acknowledgeMarathonStealNotification,
  buyMarathonShopItem,
  marathonSnapshot,
  parseMarathonNotificationVersion,
  parseMarathonRequest,
  parseMarathonShopRequest,
  parseMarathonStealRequest,
  readMarathonContext,
  stealMarathon,
  waterMarathon,
} from "@/lib/games/marathon-store";

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
    let body: unknown;
    try { body = await readBody(req); }
    catch { return json({ error: "操作を確認してください。" }, 400); }
    const context = await readMarathonContext(req);
    if (!context) return json({ error: "チーム画面でログインし直してください。" }, 401);

    const action = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).action : undefined;
    if (action === "acknowledge-steal-notification") {
      const version = parseMarathonNotificationVersion(body);
      if (version === null) return json({ error: "通知の確認情報を確認してください。" }, 400);
      const result = await acknowledgeMarathonStealNotification(req, context, version);
      if (!result.context) return json({ error: "チーム画面でログインし直してください。" }, 401);
      return json(marathonSnapshot(result.context), 200, renewSessionHeaders(req));
    }

    if (action === "steal") {
      const request = parseMarathonStealRequest(body);
      if (!request) return json({ error: "強奪の操作を確認してください。" }, 400);
      const result = await stealMarathon(req, context, request);
      if (!result.context) return json({ error: "チーム画面でログインし直してください。" }, 401);
      const snapshot = marathonSnapshot(result.context);
      const headers = renewSessionHeaders(req);
      if (result.status === "conflict") return json({ error: "ランキングが更新されました。最新の状態を読み込みました。", snapshot }, 409, headers);
      if (result.status === "daily-limit") return json({ error: "今日は強奪を2回使いました。", snapshot }, 409, headers);
      if (result.status === "insufficient") return json({ error: "強奪には累計給水量が10mL以上必要です。", snapshot }, 409, headers);
      if (result.status === "no-target") return json({ error: "強奪できる上位メンバーがいません。", snapshot }, 409, headers);
      return json(snapshot, 200, headers);
    }

    if (action === "shop-buy") {
      const request = parseMarathonShopRequest(body);
      if (!request) return json({ error: "ショップの購入情報を確認してください。" }, 400);
      const result = await buyMarathonShopItem(req, context, request);
      if (!result.context) return json({ error: "チーム画面でログインし直してください。" }, 401);
      const snapshot = marathonSnapshot(result.context);
      const headers = renewSessionHeaders(req);
      if (result.status === "conflict") return json({ error: "小林の様子が更新されました。残高を確認してください。", snapshot }, 409, headers);
      if (result.status === "daily-limit") return json({ error: "このアイテムは今日の購入上限に達しています。", snapshot }, 409, headers);
      if (result.status === "insufficient") return json({ error: "累計給水量が足りません。", snapshot }, 409, headers);
      return json(snapshot, 200, headers);
    }

    const request = parseMarathonRequest(body);
    if (!request) return json({ error: "給水の操作を確認してください。" }, 400);
    const result = await waterMarathon(req, context, request);
    if (!result.context) return json({ error: "チーム画面でログインし直してください。" }, 401);
    const snapshot = marathonSnapshot(result.context);
    const headers = renewSessionHeaders(req);
    if (result.status === "conflict") return json({ error: "ひと足先に誰かが給水しました。小林の最新の様子に更新しました。", snapshot }, 409, headers);
    if (result.status === "waiting") return json({ error: "小林はまだおなかいっぱいです。少し待ってから給水してください。", snapshot }, 409, headers);
    if (result.status === "resting") return json({ error: "今は水いらないよ！給水できる時間になったら、またお願いします。", snapshot }, 409, headers);
    if (result.status === "daily-limit") return json({ error: "今日は10回給水しました。また明日お願いします。", snapshot }, 409, headers);
    if (result.status === "exclusive") return json({ error: `${result.context.state.exclusivePlayerName ?? "メンバー"}だけが今日の給水をできます。`, snapshot }, 409, headers);
    return json(snapshot, 200, headers);
  } catch (error) {
    console.error("[marathon:POST]", error);
    return json({ error: "給水結果を確認できませんでした。同じ給水を再試行してください。" }, 503);
  }
}
