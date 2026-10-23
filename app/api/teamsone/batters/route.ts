import { getTeamsOneStats } from "@/lib/teamsone-stats-api";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getTeamsOneStats(request, "batting");
}
