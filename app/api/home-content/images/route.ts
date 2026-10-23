import { HOME_IMAGE_MAX_BYTES, HOME_IMAGE_MAX_COUNT, HOME_IMAGE_MAX_STORAGE, HOME_IMAGE_PATH, matchesHomeImageType } from "@/lib/home-images";
import { db, getSession, json, random, renewSessionHeaders, sameOrigin } from "@/lib/server";

export const dynamic = "force-dynamic";
const forbidden = () => json({ error: "お知らせ・コラムの画像をアップロードする権限がありません。" }, 403);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "リクエストを確認できません。" }, 403);
  try {
    const session = await getSession(req);
    if (!session?.member) return json({ error: "再ログインしてください。" }, 401);
    if (session.member.canEditLineup !== true) return forbidden();
    const type = req.headers.get("Content-Type")?.toLowerCase();
    if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type)) return json({ error: "JPEG・PNG・WebPの画像を選んでください。" }, 415);
    const tooLarge = () => json({ error: "画像が大きすぎます。別の画像を選んでください。" }, 413);
    const declaredLength = req.headers.get("Content-Length");
    if (declaredLength !== null && Number(declaredLength) > HOME_IMAGE_MAX_BYTES) return tooLarge();
    if (!req.body) return json({ error: "画像を選んでください。" }, 400);
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > HOME_IMAGE_MAX_BYTES) {
          await reader.cancel();
          return tooLarge();
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (!matchesHomeImageType(bytes, type)) return json({ error: "画像を読み取れませんでした。JPEG・PNG・WebPの画像を選び直してください。" }, 400);

    const database = db();
    const id = random();
    const url = HOME_IMAGE_PATH + id;
    const now = Date.now();
    const guard = `EXISTS (SELECT 1 FROM sessions s
      JOIN member_devices d ON d.hash=s.device_hash JOIN players p ON p.id=d.player_id
      WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
        AND p.id=? AND p.sort_order IS NOT NULL AND p.can_edit_lineup=1)`;
    const results = await database.batch([
      // Keep every saved article's image; abandoned uploads expire after a day.
      database.prepare(`DELETE FROM home_images WHERE created_at<?
        AND NOT EXISTS (SELECT 1 FROM home_columns WHERE image_url=? || home_images.id)
        AND ${guard}`).bind(now - 86400000, HOME_IMAGE_PATH, session.hash, now, session.member.id),
      database.prepare(`INSERT INTO home_images(id,content_type,data,byte_size,created_by,created_at)
        SELECT ?,?,?,?,?,? WHERE ${guard}
          AND (SELECT count(*) FROM home_images) < ?
          AND (SELECT COALESCE(sum(byte_size),0) FROM home_images) + ? <= ?
        RETURNING id`).bind(id, type, bytes.buffer, size, session.member.id, now,
          session.hash, now, session.member.id, HOME_IMAGE_MAX_COUNT, size, HOME_IMAGE_MAX_STORAGE),
    ]);
    if (!results[1]?.results.length) {
      const current = await getSession(req);
      if (!current?.member) return json({ error: "再ログインしてください。" }, 401);
      if (current.member.canEditLineup !== true) return forbidden();
      return json({ error: "画像の保存上限に達しました。使わないコラム画像を外して保存し、翌日以降に再度お試しください。" }, 507);
    }
    return json({ url }, 201, renewSessionHeaders(req));
  } catch {
    return json({ error: "画像をアップロードできませんでした。時間をおいて再度お試しください。" }, 503);
  }
}
