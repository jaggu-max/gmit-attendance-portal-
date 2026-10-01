import { NextResponse } from "next/server";
import { z } from "zod";
import { getHod } from "@/lib/roles-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

const schema = z.object({
  section: z.enum(["3A", "3B", "5A", "5B", "7A", "7B"]),
  courseCode: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/),
  password: z.string()
    .min(12)
    .max(72)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

export async function POST(req: Request) {
  if (!(await getHod())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Password must be 12–72 characters and include uppercase, lowercase, a number, and a symbol." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gmit_set_faculty_password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_section: parsed.data.section,
        p_course_code: parsed.data.courseCode.toUpperCase(),
        p_password: parsed.data.password,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not assign the lecturer password. Ensure the password migration has been applied." },
        { status: 503 }
      );
    }
    const result = await response.json();
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Could not assign password." }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to Supabase." },
      { status: 503 }
    );
  }
}
