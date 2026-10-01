import { NextResponse } from "next/server";
import { z } from "zod";
import { setFaculty } from "@/lib/roles-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
const schema = z.object({
  section: z.enum(["3A", "3B", "5A", "5B", "7A", "7B"]),
  password: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Select a valid section and enter your password." }, { status: 400 });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: "Faculty authentication is not configured." }, { status: 503 });
  }

  try {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = req.headers.get("x-real-ip") || forwardedFor?.split(",")[0]?.trim() || "";
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gmit_authenticate_faculty`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_section: parsed.data.section,
        p_password: parsed.data.password,
        p_client_ip: clientIp,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Faculty authentication is unavailable." }, { status: 503 });
    }
    const json = await response.json();
    if (!json.success) {
      return NextResponse.json(
        { error: json.error || "Invalid section or password." },
        { status: 401 }
      );
    }
    await setFaculty({
      section: json.section,
      courseCode: json.courseCode,
      subject: json.subject,
      teacher: json.teacher,
    });
    return NextResponse.json({ success: true, faculty: {
      section: json.section, courseCode: json.courseCode, subject: json.subject, teacher: json.teacher, conducted: json.conducted } });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
