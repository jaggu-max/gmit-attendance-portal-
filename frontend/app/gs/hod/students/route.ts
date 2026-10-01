import { NextResponse } from "next/server";
import { z } from "zod";
import { getHod } from "@/lib/roles-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
const sections = ["3A", "3B", "5A", "5B", "7A", "7B"] as const;

const studentSchema = z.object({
  section: z.enum(sections),
  usn: z.string().trim().toUpperCase().regex(/^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/),
  name: z.string().trim().min(1).max(120),
});

function configError() {
  return NextResponse.json(
    { error: "Supabase is not configured on the server." },
    { status: 503 }
  );
}

export async function GET(req: Request) {
  if (!(await getHod())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) return configError();

  const section = new URL(req.url).searchParams.get("section")?.toUpperCase();
  if (!sections.includes(section as (typeof sections)[number])) {
    return NextResponse.json({ error: "Choose a valid section." }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({
      select: "usn,full_name,serial_no",
      section_code: `eq.${section}`,
      order: "serial_no.asc,usn.asc",
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/students?${query}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not load students from Supabase." },
        { status: 503 }
      );
    }
    const students = (await response.json()) as {
      usn: string;
      full_name: string;
      serial_no: number;
    }[];
    return NextResponse.json({
      students: students.map((student) => ({
        usn: student.usn,
        name: student.full_name,
        serial: student.serial_no,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to Supabase." },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await getHod())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) return configError();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = studentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid section, student name, and USN (for example 4GM24CS001)." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/students`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        usn: parsed.data.usn,
        section_code: parsed.data.section,
        full_name: parsed.data.name,
      }),
    });
    if (response.status === 409) {
      return NextResponse.json(
        { error: "A student with this USN is already registered." },
        { status: 409 }
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not register the student in Supabase." },
        { status: 503 }
      );
    }
    const [student] = (await response.json()) as {
      usn: string;
      full_name: string;
      section_code: string;
      serial_no: number;
    }[];
    return NextResponse.json(
      {
        success: true,
        student: {
          usn: student.usn,
          name: student.full_name,
          section: student.section_code,
          serial: student.serial_no,
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
  if (!SUPABASE_URL || !SUPABASE_KEY) return configError();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = studentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid section, student name, and USN." },
      { status: 400 }
    );
  }

  const query = new URLSearchParams({
    usn: `eq.${parsed.data.usn}`,
    section_code: `eq.${parsed.data.section}`,
  });
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/students?${query}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ full_name: parsed.data.name }),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not update the student in Supabase." },
        { status: 503 }
      );
    }
    const [student] = (await response.json()) as {
      usn: string;
      full_name: string;
      section_code: string;
      serial_no: number;
    }[];
    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      student: {
        usn: student.usn,
        name: student.full_name,
        section: student.section_code,
        serial: student.serial_no,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to Supabase." },
      { status: 503 }
    );
  }
}
