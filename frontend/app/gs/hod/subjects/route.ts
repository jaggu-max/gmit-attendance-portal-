import { NextResponse } from "next/server";
import { z } from "zod";
import { getHod } from "@/lib/roles-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
const sections = ["3A", "3B", "5A", "5B", "7A", "7B"] as const;

const subjectSchema = z.object({
  section: z.enum(sections),
  courseCode: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/).transform((value) => value.toUpperCase()),
  subject: z.string().trim().min(1).max(120),
  teacher: z.string().trim().min(1).max(120),
  conducted: z.number().int().min(0).default(0),
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

  const parsed = subjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid section, course code, subject name, and teacher name." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/subjects`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        section_code: parsed.data.section,
        course_code: parsed.data.courseCode,
        subject_name: parsed.data.subject,
        teacher: parsed.data.teacher,
        conducted: parsed.data.conducted,
      }),
    });

    if (response.status === 409) {
      return NextResponse.json(
        { error: "That course code is already registered for this section." },
        { status: 409 }
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not register the subject in Supabase." },
        { status: 503 }
      );
    }

    const [subject] = (await response.json()) as {
      section_code: string;
      course_code: string;
      subject_name: string;
      teacher: string;
      conducted: number;
    }[];
    return NextResponse.json(
      {
        success: true,
        subject: {
          section: subject.section_code,
          courseCode: subject.course_code,
          subject: subject.subject_name,
          teacher: subject.teacher,
          conducted: subject.conducted,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not connect to Supabase." },
      { status: 503 }
    );
  }
}

export async function PUT(req: Request) {
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
  const parsed = subjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid section, course code, subject name, and teacher name." },
      { status: 400 }
    );
  }

  const query = new URLSearchParams({
    section_code: `eq.${parsed.data.section}`,
    course_code: `eq.${parsed.data.courseCode}`,
  });
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/subjects?${query}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        subject_name: parsed.data.subject,
        teacher: parsed.data.teacher,
        conducted: parsed.data.conducted,
      }),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not update the subject in Supabase." },
        { status: 503 }
      );
    }
    const [subject] = (await response.json()) as {
      section_code: string;
      course_code: string;
      subject_name: string;
      teacher: string;
      conducted: number;
    }[];
    if (!subject) {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      subject: {
        section: subject.section_code,
        courseCode: subject.course_code,
        subject: subject.subject_name,
        teacher: subject.teacher,
        conducted: subject.conducted,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to Supabase." },
      { status: 503 }
    );
  }
}
