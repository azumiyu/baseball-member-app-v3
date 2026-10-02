import { HOME_IMAGE_ID, HOME_IMAGE_PATH } from "@/lib/home-images";
import { db, getSession } from "@/lib/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };

async function imageResponse(req: Request, context: Context, head: boolean) {
  const { id } = await context.params;
  if (!HOME_IMAGE_ID.test(id)) return new Response(null, { status: 404, headers });
  try {
    const session = await getSession(req);
    const image = await db().prepare(`SELECT content_type,byte_size,${head ? "NULL" : "data"} AS data
      FROM home_images WHERE id=? AND (
        EXISTS (SELECT 1 FROM home_columns WHERE image_url=? AND published=1)
        OR EXISTS (SELECT 1 FROM sessions s
          JOIN member_devices d ON d.hash=s.device_hash JOIN players p ON p.id=d.player_id
          WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
            AND p.id=? AND p.sort_order IS NOT NULL AND p.is_admin=1)
      )`).bind(id, HOME_IMAGE_PATH + id, session?.hash ?? "", Date.now(), session?.member?.id ?? "")
      .first<{ content_type: string; byte_size: number; data: number[] | ArrayBuffer | null }>();
    if (!image) return new Response(null, { status: 404, headers });
    const body = !head && image.data ? new Uint8Array(image.data as ArrayBuffer) : null;
    return new Response(body, { headers: { ...headers, "Content-Type": image.content_type, "Content-Length": String(image.byte_size) } });
  } catch { return new Response(null, { status: 503, headers }); }
}

export function GET(req: Request, context: Context) { return imageResponse(req, context, false); }
export function HEAD(req: Request, context: Context) { return imageResponse(req, context, true); }
