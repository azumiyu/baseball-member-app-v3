import { createTeamsOneBattersLoader } from "@/lib/teamsone-batters-cache";
import { parseTeamsOneFilters, TEAMS_ONE_BATTERS_FRESH_MS } from "@/lib/teamsone-batters";

export const dynamic = "force-dynamic";
const load = createTeamsOneBattersLoader();

export async function GET(request: Request) {
  try { parseTeamsOneFilters(request.url); }
  catch {
    return Response.json({ error: "年または試合属性の指定が正しくありません。" }, { status: 400 });
  }
  try {
    const data = await load(request.url);
    const remaining = data.stale ? 60 : Math.max(1, Math.floor((Date.parse(data.fetchedAt) + TEAMS_ONE_BATTERS_FRESH_MS - Date.now()) / 1000));
    return Response.json(data, { headers: {
      "Cache-Control": `public, max-age=${Math.min(60, remaining)}, s-maxage=${remaining}`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return Response.json({ error: "Teams.oneの打者成績を取得できませんでした。しばらくしてから再度お試しください。" }, {
      status: 503, headers: { "Cache-Control": "public, max-age=30, s-maxage=60", "Retry-After": "60" },
    });
  }
}
