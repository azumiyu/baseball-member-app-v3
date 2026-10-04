const TEAMS_ONE_URL = "https://teams.one/teams/ygfires/game";
const TEAMS_ONE_ORIGIN = "https://teams.one";

type RecentGame = {
  id: string;
  date: string;
  type: string;
  opponent: string;
  score: string;
  result: string;
  url: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textContent(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirst(block: string, pattern: RegExp): string {
  const match = block.match(pattern);
  return match ? textContent(match[1]) : "";
}

function parseGames(html: string): RecentGame[] {
  const games: RecentGame[] = [];
  const itemPattern =
    /<li>\s*<a\b[^>]*class=["'][^"']*\btoDetailLink\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>\s*<\/li>/gi;

  for (const match of html.matchAll(itemPattern)) {
    const block = match[0];
    const href = match[1];

    const date =
      block.match(
        /<p\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>(\d{4}\/\d{1,2}\/\d{1,2})/i,
      )?.[1] ?? "";

    const opponentBlock =
      block.match(
        /<p\b[^>]*class=["'][^"']*\bopponent\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
      )?.[1] ?? "";

    const type = extractFirst(
      opponentBlock,
      /<span\b[^>]*>([\s\S]*?)<\/span>/i,
    );

    const opponent = textContent(
      opponentBlock.replace(/<span\b[^>]*>[\s\S]*?<\/span>/i, " "),
    );

    const score = extractFirst(
      block,
      /<p\b[^>]*class=["'][^"']*\bscore\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
    );

    const result = extractFirst(
      block,
      /<p\b[^>]*class=["'][^"']*\bresult\b[^"']*["'][^>]*>[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i,
    );

    const normalizedDate = date.replace(/-/g, "/");
    if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(normalizedDate)) continue;
    if (!opponent) continue;

    games.push({
      id: href.match(/\/game\/(\d+)/i)?.[1] ?? `${normalizedDate}-${opponent}`,
      date: normalizedDate,
      type,
      opponent,
      score,
      result,
      url: new URL(href, TEAMS_ONE_ORIGIN).toString(),
    });
  }

  return games;
}

function todayInJapan(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateKey(date: string): string {
  const [year, month, day] = date.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export async function GET() {
  try {
    const response = await fetch(TEAMS_ONE_URL, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "YG-FIRES-homepage/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json(
        {
          ok: false,
          error: `TeamsONEの取得に失敗しました（HTTP ${response.status}）。`,
        },
        { status: 502 },
      );
    }

    const html = await response.text();
    const today = todayInJapan();

    const games = parseGames(html)
      .filter((game) => dateKey(game.date) <= today)
      .filter((game) => !game.type.includes("その他") && !game.result.includes("その他"))
      .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
      .slice(0, 5);

    return Response.json(
      {
        ok: true,
        source: TEAMS_ONE_URL,
        fetchedAt: new Date().toISOString(),
        games,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json(
      {
        ok: false,
        error: `TeamsONEの試合情報を取得できませんでした。 ${message}`,
      },
      { status: 502 },
    );
  }
}
