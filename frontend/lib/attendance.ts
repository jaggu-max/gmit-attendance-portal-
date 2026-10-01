import "server-only";
import type { AttendanceData, RawSubject, Subject } from "./types";
import { deriveStatus, MIN_REQUIRED } from "./status";
import { apiGet, ApiUnavailableError } from "./attendanceApi";

const TTL = Number(process.env.ATTENDANCE_CACHE_TTL_MS ?? 60000);

interface CacheEntry {
  data: AttendanceData;
  ts: number;
}

// persist cache across hot reloads in dev
const g = globalThis as unknown as {
  __gmitAttendanceCache?: Map<string, CacheEntry>;
};
const cache: Map<string, CacheEntry> =
  g.__gmitAttendanceCache ?? (g.__gmitAttendanceCache = new Map());

export const ALLOWED_SECTIONS = (
  process.env.ALLOWED_SECTIONS ?? "3A,3B,5A,5B,7A,7B"
)
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

export function isValidSection(section: string): boolean {
  return ALLOWED_SECTIONS.includes(section.trim().toUpperCase());
}

/** GMIT USN pattern e.g. 4GM24CS052 */
export function isValidUsn(usn: string): boolean {
  return /^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/.test(usn.trim().toUpperCase());
}

export function normalizeUsn(usn: string): string {
  return usn.trim().toUpperCase();
}

export function normalizeSection(section: string): string {
  return section.trim().toUpperCase();
}

function key(section: string, usn: string): string {
  return `${section}::${usn}`;
}

interface RawResponse {
  success: boolean;
  error?: string;
  updatedAt?: string;
  minimumRequired?: number;
  student?: { usn: string; name: string; section: string };
  overall?: Omit<AttendanceData["overall"], "displayStatus">;
  subjects?: RawSubject[];
}

function normalize(raw: RawResponse): AttendanceData {
  const minimumRequired = raw.minimumRequired ?? MIN_REQUIRED;
  const subjects: Subject[] = (raw.subjects ?? []).map((s) => ({
    ...s,
    displayStatus: deriveStatus(s.percentage, s.isStarted, minimumRequired),
  }));
  const o = raw.overall!;
  return {
    student: raw.student!,
    overall: {
      ...o,
      displayStatus: deriveStatus(o.percentage, o.isStarted, minimumRequired),
    },
    subjects,
    minimumRequired,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}

export class AttendanceUnavailableError extends Error {}
export class StudentNotFoundError extends Error {}

async function fetchFromSource(
  section: string,
  usn: string
): Promise<AttendanceData> {
  if (process.env.SUPABASE_URL === "mock" || process.env.SUPABASE_URL === "demo") {
    const normSec = section.trim().toUpperCase();
    const normUsn = usn.trim().toUpperCase();
    return {
      student: { usn: normUsn, name: "Sample Student", section: normSec },
      overall: { attended: 45, conducted: 50, percentage: 90, minimumRequired: 75, status: "EXCELLENT", isStarted: true, displayStatus: "EXCELLENT" },
      subjects: [
        { courseCode: "21CS51", subject: "Computer Networks & Security", teacher: "Dr. GMIT Lecturer", attended: 14, conducted: 15, percentage: 93.33, minimumRequired: 75, status: "EXCELLENT", isStarted: true, displayStatus: "EXCELLENT", buffer: { canMiss: 3, message: "You can miss 3 upcoming classes." }, recovery: { needed: 0, message: "On track." } },
        { courseCode: "21CS52", subject: "Database Management Systems", teacher: "Prof. Database", attended: 12, conducted: 15, percentage: 80, minimumRequired: 75, status: "ON_TRACK", isStarted: true, displayStatus: "ON_TRACK", buffer: { canMiss: 1, message: "You can miss 1 upcoming class." }, recovery: { needed: 0, message: "On track." } }
      ],
      minimumRequired: 75,
      updatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString()
    };
  }
  try {
    const json = (await apiGet("student", { section, usn })) as RawResponse;

    if (!json.success) {
      throw new StudentNotFoundError(json.error ?? "not found");
    }
    return normalize(json);
  } catch (err) {
    if (err instanceof StudentNotFoundError) throw err;
    if (err instanceof ApiUnavailableError) {
      throw new AttendanceUnavailableError(err.message);
    }
    throw new AttendanceUnavailableError("Unable to load attendance.");
  }
}

/**
 * Server-side attendance service with a short cache.
 * @param force bypass cache (manual refresh)
 */
export async function getAttendance(
  section: string,
  usn: string,
  force = false
): Promise<AttendanceData> {
  const k = key(section, usn);
  const now = Date.now();
  const hit = cache.get(k);
  if (!force && hit && now - hit.ts < TTL) {
    return hit.data;
  }
  try {
    const data = await fetchFromSource(section, usn);
    cache.set(k, { data, ts: now });
    return data;
  } catch (err) {
    // On failure, serve stale cache if we have any (offline resilience)
    if (hit) return hit.data;
    throw err;
  }
}

/** returns cached entry age in ms or null */
export function cacheAge(section: string, usn: string): number | null {
  const hit = cache.get(key(section, usn));
  return hit ? Date.now() - hit.ts : null;
}
