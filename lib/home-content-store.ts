import { db, random, type AuthSession } from "@/lib/server";
import { type HomeContent, type HomeNotice, type HomeColumn } from "@/lib/home-content";

export async function readHomeContent(publicOnly = false): Promise<{ data: HomeContent; revision: number }> {
  const result = await db().prepare(`
    SELECT revision,
      (SELECT json_group_array(json_object('id',id,'date',date,'text',text,'published',published))
       FROM (SELECT id,date,text,published FROM home_notices WHERE ?=0 OR published=1 ORDER BY sort_order,id)) AS notices,
      (SELECT json_group_array(json_object('id',id,'date',date,'title',title,'body',body,'imageUrl',image_url,
        'imageAlt',image_alt,'linkUrl',link_url,'linkLabel',link_label,'published',published))
       FROM (SELECT * FROM home_columns WHERE ?=0 OR published=1 ORDER BY sort_order,id)) AS columns
    FROM app_revisions WHERE scope='home_content'
  `).bind(Number(publicOnly), Number(publicOnly)).first<{ revision: number; notices: string; columns: string }>();
  if (!result) throw new Error("ホームページの保存先を準備中です。");
  const notices = JSON.parse(result.notices) as (Omit<HomeNotice, "published"> & { published: number })[];
  const columns = JSON.parse(result.columns) as (Omit<HomeColumn, "published"> & { published: number })[];
  return { revision: result.revision, data: {
    notices: notices.map((notice) => ({ ...notice, published: notice.published === 1 })),
    columns: columns.map((column) => ({ ...column, published: column.published === 1 })),
  } };
}

export async function writeHomeContent(data: HomeContent, revision: number, session: AuthSession): Promise<number | null> {
  if (!session.member?.isAdmin) return null;
  const database = db();
  const writeToken = random();
  const guard = "EXISTS (SELECT 1 FROM app_revisions WHERE scope='home_content' AND write_token=?)";
  const statements = [database.prepare(`
    UPDATE app_revisions SET revision=revision+1, write_token=?
    WHERE scope='home_content' AND revision=? AND EXISTS (
      SELECT 1 FROM sessions s
      JOIN member_devices d ON d.hash=s.device_hash
      JOIN players p ON p.id=d.player_id
      WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
        AND p.id=? AND p.sort_order IS NOT NULL AND p.is_admin=1
    )
  `).bind(writeToken, revision, session.hash, Date.now(), session.member.id),
  database.prepare(`DELETE FROM home_notices WHERE ${guard}`).bind(writeToken),
  database.prepare(`DELETE FROM home_columns WHERE ${guard}`).bind(writeToken)];
  for (const [index, notice] of data.notices.entries()) {
    statements.push(database.prepare(`INSERT INTO home_notices(id,date,text,published,sort_order)
      SELECT ?,?,?,?,? WHERE ${guard}`).bind(notice.id, notice.date, notice.text, Number(notice.published), index, writeToken));
  }
  for (const [index, column] of data.columns.entries()) {
    statements.push(database.prepare(`INSERT INTO home_columns(id,date,title,body,image_url,image_alt,link_url,link_label,published,sort_order)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(column.id, column.date, column.title, column.body, column.imageUrl,
      column.imageAlt, column.linkUrl, column.linkLabel, Number(column.published), index, writeToken));
  }
  statements.push(database.prepare(`SELECT revision FROM app_revisions WHERE scope='home_content' AND write_token=?`).bind(writeToken));
  const results = await database.batch(statements);
  return (results.at(-1)?.results[0] as { revision: number } | undefined)?.revision ?? null;
}
