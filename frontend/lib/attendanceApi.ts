import "server-only";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
const TIMEOUT = 25000;

export class ApiUnavailableError extends Error {}
export class ApiNotDeployedError extends Error {
  constructor() {
    super("The attendance database function is not deployed yet. Apply the Supabase migration.");
  }
}

export const READ_ACTIONS = [
  "health", "sections", "student", "subjects",
  "facultysubjects", "students", "attendance", "history",
];

export const WRITE_ACTIONS = ["submitAttendance", "updateAttendance", "undoAttendance", "deleteAttendance"];

function isMock(): boolean {
  return SUPABASE_URL === "mock" || SUPABASE_URL === "demo";
}

function getMockResponse(action: string, params: Record<string, string | undefined>): any {
  const section = (params.section || "3A").toUpperCase();
  const courseCode = (params.courseCode || "21CS51").toUpperCase();

  switch (action) {
    case "health":
      return { success: true, app: "GMIT Attendance API (Mock)", status: "online", sections: ["3A", "3B", "5A", "5B", "7A", "7B"] };
    case "sections":
      return {
        success: true,
        sections: { "3A": { available: true }, "3B": { available: true }, "5A": { available: true }, "5B": { available: true }, "7A": { available: true }, "7B": { available: true } },
      };
    case "authorizesubject":
      return {
        success: true,
        section,
        courseCode,
        subject: courseCode === "21CS51" ? "Computer Networks & Security" : `${courseCode} Subject`,
        teacher: "Dr. GMIT Lecturer",
        conducted: 15,
        studentCount: 60,
      };
    case "subjects":
      return {
        success: true,
        section,
        subjects: [
          { courseCode: "21CS51", subject: "Computer Networks & Security", teacher: "Dr. GMIT Lecturer", conducted: 15 },
          { courseCode: "21CS52", subject: "Database Management Systems", teacher: "Prof. Database", conducted: 14 },
          { courseCode: "21CS53", subject: "Web Technology & Applications", teacher: "Prof. Web", conducted: 16 },
        ],
        studentCount: 60,
      };
    case "students":
      return {
        success: true,
        section,
        courseCode,
        subject: "Computer Networks & Security",
        teacher: "Dr. GMIT Lecturer",
        conducted: 15,
        students: Array.from({ length: 10 }, (_, i) => ({
          serial: i + 1,
          usn: `4GM24CS${String(i + 1).padStart(3, "0")}`,
          name: `Student ${i + 1}`,
          attended: 12 + (i % 4),
          conducted: 15,
          percentage: Math.round(((12 + (i % 4)) / 15) * 100),
          minimumRequired: 75,
          status: "ON_TRACK",
          isStarted: true,
        })),
      };
    case "attendance":
      return {
        success: true,
        submitted: false,
        section,
        courseCode,
        subject: "Computer Networks & Security",
        teacher: "Dr. GMIT Lecturer",
        date: params.date || new Date().toISOString().split("T")[0],
        attendance: {},
      };
    case "history":
      return { success: true, history: [] };
    default:
      return { success: true };
  }
}

function postMockResponse(payload: Record<string, unknown>): any {
  return {
    success: true,
    operation: String(payload.action || "submit"),
    section: String(payload.section || "3A").toUpperCase(),
    courseCode: String(payload.courseCode || "21CS51").toUpperCase(),
    date: String(payload.date || new Date().toISOString().split("T")[0]),
    conducted: 16,
    present: 9,
    absent: 1,
    total: 10,
  };
}

function ctrl() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function callDatabase(
  action: string,
  params: Record<string, unknown>,
  retries: number
): Promise<any> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new ApiUnavailableError("Supabase is not configured.");
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { signal, done } = ctrl();
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gmit_attendance_api`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_action: action, p_params: params }),
        cache: "no-store",
        signal,
      });
      const text = await res.text();
      done();
      if (res.status === 404 || res.status === 400 && /function/i.test(text)) {
        throw new ApiNotDeployedError();
      }
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ApiUnavailableError("Supabase returned an invalid response.");
      }
      if (!res.ok) {
        throw new ApiUnavailableError(json.message || json.error || `Supabase request failed (${res.status}).`);
      }
      if (json && typeof json === "object" && !Array.isArray(json) && json.updatedAt === undefined) {
        json.updatedAt = new Date().toISOString();
      }
      return json;
    } catch (err) {
      done();
      if (err instanceof ApiNotDeployedError) throw err;
      lastErr = err;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new ApiUnavailableError(
    lastErr instanceof Error ? lastErr.message : "Supabase request failed."
  );
}

export async function apiGet(
  action: string,
  params: Record<string, string | undefined> = {}
): Promise<any> {
  if (isMock()) {
    return getMockResponse(action, params);
  }
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
  return callDatabase(action, filtered, 3);
}

export async function apiPost(payload: Record<string, unknown>): Promise<any> {
  if (isMock()) {
    return postMockResponse(payload);
  }
  
  const action = String(payload.action || "");
  return callDatabase(action, payload, 1);
}
