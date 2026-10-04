import { validateHomeContent, type HomeContent } from "@/lib/home-content";
import { readHomeContent, writeHomeContent } from "@/lib/home-content-store";
import { getSession, json, readBody, renewSessionHeaders, sameOrigin } from "@/lib/server";

export const dynamic = "force-dynamic";
const forbidden = () => json({ error: "ホームページを編集できるのは管理者だけです。" }, 403);

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    if (!session?.member) return json({ error: "ログインしてください。" }, 401);
    if (!session.member.canEditLineup) return forbidden();
    return json({ ...await readHomeContent(), member: session.member }, 200, renewSessionHeaders(req));
  } catch {
    return json({ error: "ホームページの内容を読み込めませんでした。再試行してください。" }, 503);
  }
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "リクエストを確認できません。" }, 403);
  try {
    const session = await getSession(req);
    if (!session?.member) return json({ error: "再ログインしてください。" }, 401);
    if (!session.member.canEditLineup) return forbidden();
    let data: HomeContent;
    let revision: number;
    try {
      const input = await readBody(req);
      if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("保存情報を確認してください。");
      data = validateHomeContent(input.data);
      revision = input.revision;
    } catch (error) {
      return json({ error: error instanceof Error && !(error instanceof SyntaxError) ? error.message : "入力内容を確認してください。" }, 400);
    }
    const savedRevision = await writeHomeContent(data, revision, session);
    if (savedRevision === null) {
      const current = await getSession(req);
      if (!current?.member) return json({ error: "再ログインしてください。" }, 401);
      if (!current.member.canEditLineup) return forbidden();
      return json({ error: "別の端末で更新されています。入力内容を控えてから最新データを読み込んでください。" }, 409);
    }
    return json({ data, revision: savedRevision, member: session.member }, 200, renewSessionHeaders(req));
  } catch {
    return json({ error: "保存できませんでした。入力内容は画面に残っています。再試行してください。" }, 503);
  }
}
