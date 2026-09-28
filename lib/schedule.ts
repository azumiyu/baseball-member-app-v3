export const ATTENDANCE_STATUSES = ["attending", "absent", "undecided"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const SCHEDULE_GAME_STATUSES = ["unconfirmed", "proposed", "confirmed"] as const;
export type ScheduleGameStatus = (typeof SCHEDULE_GAME_STATUSES)[number];

export type ScheduleResponse = {
    status: AttendanceStatus;
    comment: string;
    confirmedRevision: number;
};

export type ScheduleGame = {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    title: string;
    opponent: string;
    location: string;
    mapUrl: string;
    status: ScheduleGameStatus;
    detailsRevision: number;
    previousStartTime: string | null;
    previousEndTime: string | null;
    previousLocation: string | null;
    changedBy: string | null;
    responses: Record<string, ScheduleResponse>;
};

export type ScheduleData = { games: ScheduleGame[] };

export const SCHEDULE_LIMITS = {
    games: 1000,
    responses: 1000,
    id: 100,
    title: 80,
    opponent: 80,
    location: 200,
    mapUrl: 2048,
    comment: 500,
} as const;

export function initialScheduleData(): ScheduleData {
    return { games: [] };
}

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, field: string, maxLength: number, required = false): string {
    if (value === undefined && !required) return "";
    if (typeof value !== "string") throw new Error(`Invalid ${field}`);
    const text = value.trim();
    if (text.length > maxLength || (required && !text)) throw new Error(`Invalid ${field}`);
    return text;
}

function revisionField(value: unknown, field: string, minimum: number): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
        throw new Error(`Invalid ${field}`);
    }
    return value;
}

export function validateScheduleData(value: unknown): ScheduleData {
    if (!record(value) || !Array.isArray(value.games) || value.games.length > SCHEDULE_LIMITS.games) {
        throw new Error("Invalid schedule data");
    }

    const ids = new Set<string>();
    const games: ScheduleGame[] = value.games.map((raw: unknown) => {
        if (!record(raw)) throw new Error("Invalid schedule game");
        const id = stringField(raw.id, "schedule id", SCHEDULE_LIMITS.id, true);
        if (ids.has(id)) throw new Error("Duplicate schedule id");
        ids.add(id);

        if (typeof raw.status !== "string"
            || !SCHEDULE_GAME_STATUSES.includes(raw.status as ScheduleGameStatus)) {
            throw new Error("Invalid schedule status");
        }
        const detailsRevision = revisionField(raw.detailsRevision, "schedule details revision", 1);

        const date = stringField(raw.date, "schedule date", 10, true);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-")) {
            throw new Error("Invalid schedule date");
        }
        const parsedDate = new Date(`${date}T00:00:00.000Z`);
        if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
            throw new Error("Invalid schedule date");
        }

        const startTime = stringField(raw.startTime, "start time", 5);
        if (startTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
            throw new Error("Invalid start time");
        }
        const endTime = stringField(raw.endTime, "end time", 5);
        if (endTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
            throw new Error("Invalid end time");
        }
        const mapUrl = stringField(raw.mapUrl, "map URL", SCHEDULE_LIMITS.mapUrl);
        if (mapUrl) {
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(mapUrl);
            } catch {
                throw new Error("Invalid map URL");
            }
            if (!/^https?:\/\//i.test(mapUrl) || !["http:", "https:"].includes(parsedUrl.protocol)
                || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
                throw new Error("Invalid map URL");
            }
        }

        if (!record(raw.responses)) throw new Error("Invalid schedule responses");
        const responseEntries = Object.entries(raw.responses);
        if (responseEntries.length > SCHEDULE_LIMITS.responses) throw new Error("Too many schedule responses");
        const playerIds = new Set<string>();
        const responses = Object.fromEntries(responseEntries.map(([rawPlayerId, response]) => {
            const playerId = stringField(rawPlayerId, "player id", SCHEDULE_LIMITS.id, true);
            if (playerIds.has(playerId)) throw new Error("Duplicate response player id");
            playerIds.add(playerId);
            if (!record(response) || typeof response.status !== "string"
                || !ATTENDANCE_STATUSES.includes(response.status as AttendanceStatus)) {
                throw new Error("Invalid attendance status");
            }
            return [playerId, {
                status: response.status as AttendanceStatus,
                comment: stringField(response.comment, "response comment", SCHEDULE_LIMITS.comment),
                confirmedRevision: revisionField(response.confirmedRevision, "response confirmed revision", 0),
            }];
        }));

        return {
            id,
            date,
            startTime,
            endTime,
            title: stringField(raw.title, "schedule title", SCHEDULE_LIMITS.title),
            opponent: stringField(raw.opponent, "opponent", SCHEDULE_LIMITS.opponent),
            location: stringField(raw.location, "location", SCHEDULE_LIMITS.location),
            mapUrl,
            status: raw.status as ScheduleGameStatus,
            detailsRevision,
            previousStartTime: raw.previousStartTime === null ? null : stringField(raw.previousStartTime, "previous start time", 5),
            previousEndTime: raw.previousEndTime == null ? null : stringField(raw.previousEndTime, "previous end time", 5),
            previousLocation: raw.previousLocation === null ? null : stringField(raw.previousLocation, "previous location", SCHEDULE_LIMITS.location),
            changedBy: raw.changedBy === null ? null : stringField(raw.changedBy, "changed by", SCHEDULE_LIMITS.id, true),
            responses,
        };
    });
    return { games };
}

/** Calendar date in Japan, independent of the server or browser time zone. */
export function japanDate(now: Date = new Date()): string {
    return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Includes today on Saturday and advances to next Saturday from Sunday JST. */
export function upcomingSaturday(now: Date = new Date()): string {
    const date = new Date(`${japanDate(now)}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + (6 - date.getUTCDay() + 7) % 7);
    return date.toISOString().slice(0, 10);
}

/** Open a map search using the place name, independent of the legacy map URL. */
export function mapLinks(game: Pick<ScheduleGame, "location">): { google: string; apple: string } | null {
    const location = game.location.trim();
    if (!location) return null;
    // Official URL formats: developers.google.com/maps/documentation/urls/get-started
    // and developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html.
    const query = encodeURIComponent(location);
    return {
        google: `https://www.google.com/maps/search/?api=1&query=${query}`,
        apple: `https://maps.apple.com/?q=${query}`,
    };
}
