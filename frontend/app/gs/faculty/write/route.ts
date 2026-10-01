import { NextResponse } from "next/server";
import { getFaculty } from "@/lib/roles-auth";
import { apiPost, WRITE_ACTIONS, ApiNotDeployedError, ApiUnavailableError } from "@/lib/attendanceApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const faculty = await getFaculty();
  if (!faculty) return NextResponse.json({ error: "Not authorized. Please select your subject again." }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const action = String(body.action || "");
  if (!WRITE_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }
  const section = String(body.section || "").trim().toUpperCase();
  const courseCode = String(body.courseCode || "").trim().toUpperCase();

  // server-side authorization: lecturer may only write to their authorized class
  if (section !== faculty.section || courseCode !== faculty.courseCode) {
    return NextResponse.json({ error: "You are not authorized to modify this class." }, { status: 403 });
  }
  if (!body.date) return NextResponse.json({ error: "Date is required." }, { status: 400 });

  try {
    const json = await apiPost({
      action,
      section,
      courseCode,
      date: body.date,
      teacher: faculty.teacher,
      attendance: body.attendance,
      logId: body.logId,
      sessionId: body.sessionId,
    });
    if (json && json.success === false) {
      return NextResponse.json({ error: json.error || "Operation failed.", code: json.code }, { status: 409 });
    }
    return NextResponse.json(json);
  } catch (err) {
    if (err instanceof ApiNotDeployedError) return NextResponse.json({ error: err.message, code: "API_NOT_DEPLOYED" }, { status: 501 });
    if (err instanceof ApiUnavailableError) return NextResponse.json({ error: "Attendance service unavailable." }, { status: 503 });
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
