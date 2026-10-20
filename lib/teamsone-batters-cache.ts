import {
  parseTeamsOneFilters, teamsOneSourceUrl, type TeamsOneFilters,
  parseTeamsOneBatters, TEAMS_ONE_BATTERS_FRESH_MS,
  TEAMS_ONE_BATTERS_COLUMNS, type TeamsOneBattingSnapshot, type TeamsOneBattingResponse,
} from "./teamsone-batters";

const RETAIN_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;
type CacheState = { snapshot: TeamsOneBattingSnapshot | null; retryAt: number };
type SharedCache = Pick<Cache, "match" | "put">;

function defaultCache(): SharedCache | undefined {
  return typeof caches === "undefined" ? undefined : (caches as CacheStorage & { default?: Cache }).default;
}

async function readPage(response: Response): Promise<string> {
  if (!response.body) throw new Error("Teams.one response is empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 512_000) {
        await reader.cancel();
        throw new Error("Teams.one response is too large");
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
    return html + decoder.decode();
  } finally { reader.releaseLock(); }
}

function validState(value: unknown): value is CacheState {
  if (!value || typeof value !== "object") return false;
  const state = value as CacheState;
  if (!Number.isFinite(state.retryAt)) return false;
  if (state.snapshot === null) return true;
  const snapshot = state.snapshot;
  return !!snapshot && typeof snapshot.source === "string" && Number.isFinite(Date.parse(snapshot.fetchedAt))
    && typeof snapshot.season === "string" && Array.isArray(snapshot.columns)
    && snapshot.columns.length === TEAMS_ONE_BATTERS_COLUMNS.length
    && snapshot.columns.every((label, index) => label === TEAMS_ONE_BATTERS_COLUMNS[index])
    && Array.isArray(snapshot.rows) && snapshot.rows.length <= 250
    && snapshot.rows.every(row => typeof row.id === "string" && typeof row.name === "string" && typeof row.number === "string"
      && Array.isArray(row.values) && row.values.length === snapshot.columns.length && row.values.every(value => typeof value === "string"));
}

/** No DB reads or writes. Cache API shares snapshots within a Cloudflare data
 * center; memory also coalesces simultaneous requests inside this Worker.
 */
function createFilteredLoader(filters: TeamsOneFilters, {
  fetchPage = fetch,
  now = Date.now,
  sharedCache = defaultCache,
}: {
  fetchPage?: typeof fetch;
  now?: () => number;
  sharedCache?: () => SharedCache | undefined;
} = {}) {
  const source = teamsOneSourceUrl(filters);
  const season = filters.year === "all" ? "通算" : String(filters.year);
  let memory: CacheState | undefined;
  let pending: Promise<TeamsOneBattingResponse> | undefined;

  const result = (snapshot: TeamsOneBattingSnapshot): TeamsOneBattingResponse => ({
    ...snapshot, stale: now() - Date.parse(snapshot.fetchedAt) >= TEAMS_ONE_BATTERS_FRESH_MS,
  });
  const usable = (snapshot: TeamsOneBattingSnapshot | null | undefined): snapshot is TeamsOneBattingSnapshot =>
    !!snapshot && now() - Date.parse(snapshot.fetchedAt) < RETAIN_MS;

  async function store(cache: SharedCache | undefined, key: string, state: CacheState) {
    memory = state;
    if (!cache) return;
    const lifetime = state.snapshot ? Math.max(1, Math.floor((Date.parse(state.snapshot.fetchedAt) + RETAIN_MS - now()) / 1000)) : RETRY_MS / 1000;
    try {
      await cache.put(key, Response.json(state, { headers: { "Cache-Control": `public, max-age=${lifetime}` } }));
    } catch { /* In-memory caching still works if the edge cache is unavailable. */ }
  }

  async function readAndRefresh(requestUrl: string): Promise<TeamsOneBattingResponse> {
    const key = new URL(`/api/teamsone/batters?cache=v3&year=${filters.year}&gameType=${filters.gameType}&unreached=${filters.unreached ? 1 : 0}`, requestUrl).toString();
    let cache: SharedCache | undefined;
    try {
      cache = sharedCache();
      const cached = await cache?.match(key);
      const state: unknown = cached ? await cached.json() : undefined;
      if (validState(state) && (!state.snapshot || state.snapshot.source === source
        && state.snapshot.season === season && state.snapshot.gameType === filters.gameType)) {
        const cachedTime = usable(state.snapshot) ? Date.parse(state.snapshot.fetchedAt) : 0;
        const memoryTime = usable(memory?.snapshot) ? Date.parse(memory.snapshot.fetchedAt) : 0;
        if (!memory || cachedTime > memoryTime || cachedTime === memoryTime && state.retryAt > memory.retryAt) memory = state;
      }
    } catch { /* A cache read failure must not prevent fetching the public page. */ }

    if (usable(memory?.snapshot) && (!result(memory.snapshot).stale || now() < memory!.retryAt)) return result(memory.snapshot);
    if (memory && now() < memory.retryAt) throw new Error("Teams.one retry is delayed");

    try {
      const response = await fetchPage(source, {
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "YG-FIRES-stats/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok || Number(response.headers.get("content-length")) > 512_000) throw new Error("Teams.one is unavailable");
      const html = await readPage(response);
      if (filters.unreached && !/<input\b(?=[^>]*\bid=["']unreached["'])(?=[^>]*\bchecked(?:\s*=|\s|>|\/))[^>]*>/i.test(html)) {
        throw new Error("Teams.one did not include unqualified players");
      }
      const table = parseTeamsOneBatters(html);
      if (table.season !== season || table.gameType !== filters.gameType) throw new Error("Teams.one filters do not match");
      const snapshot = { ...table, source, fetchedAt: new Date(now()).toISOString() };
      await store(cache, key, { snapshot, retryAt: 0 });
      return result(snapshot);
    } catch {
      const snapshot = usable(memory?.snapshot) ? memory.snapshot : null;
      await store(cache, key, { snapshot, retryAt: now() + RETRY_MS });
      if (snapshot) return result(snapshot);
      throw new Error("Teams.one batting stats are unavailable");
    }
  }

  return function load(requestUrl: string): Promise<TeamsOneBattingResponse> {
    if (usable(memory?.snapshot) && (!result(memory.snapshot).stale || now() < memory!.retryAt)) return Promise.resolve(result(memory.snapshot));
    if (memory && now() < memory.retryAt) return Promise.reject(new Error("Teams.one retry is delayed"));
    if (!pending) pending = readAndRefresh(requestUrl).finally(() => { pending = undefined; });
    return pending;
  };
}

/** Each year/game-type combination has independent memory, in-flight and edge caches. */
export function createTeamsOneBattersLoader(options: Parameters<typeof createFilteredLoader>[1] = {}) {
  const loaders = new Map<string, ReturnType<typeof createFilteredLoader>>();
  return function load(requestUrl: string): Promise<TeamsOneBattingResponse> {
    const filters = parseTeamsOneFilters(requestUrl, new Date(options.now?.() ?? Date.now()));
    const key = `${filters.year}:${filters.gameType}:${filters.unreached ? 1 : 0}`;
    let loader = loaders.get(key);
    if (!loader) {
      loader = createFilteredLoader(filters, options);
      loaders.set(key, loader);
    }
    return loader(requestUrl);
  };
}
