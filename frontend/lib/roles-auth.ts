import "server-only";
import { cookies } from "next/headers";
import crypto from "crypto";

const SECRET = process.env.SESSION_SECRET ?? "";
const MAX_AGE = 60 * 60 * 12;
const FACULTY_COOKIE = "gmit_faculty_v2";

export interface FacultySession {
  section: string;
  courseCode: string;
  subject: string;
  teacher: string;
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sign(p: string) {
  return b64url(crypto.createHmac("sha256", SECRET).update(p).digest());
}
function token(data: unknown) {
  const p = b64url(Buffer.from(JSON.stringify(data), "utf8"));
  return `${p}.${sign(p)}`;
}
function verify<T>(t: string | undefined): T | null {
  if (!t) return null;
  const [p, s] = t.split(".");
  if (!p || !s) return null;
  const exp = sign(p);
  if (s.length !== exp.length || !crypto.timingSafeEqual(new Uint8Array(Buffer.from(s)), new Uint8Array(Buffer.from(exp)))) return null;
  try {
    return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as T;
  } catch { return null; }
}

const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: MAX_AGE };

/* Faculty */
export async function setFaculty(data: FacultySession) {
  (await cookies()).set(FACULTY_COOKIE, token(data), opts);
}
export async function getFaculty(): Promise<FacultySession | null> {
  return verify<FacultySession>((await cookies()).get(FACULTY_COOKIE)?.value);
}
export async function clearFaculty() {
  (await cookies()).set(FACULTY_COOKIE, "", { ...opts, maxAge: 0 });
}

/* HOD */
export async function setHod() {
  (await cookies()).set("gmit_hod", token({ role: "hod", t: Date.now() }), opts);
}
export async function getHod(): Promise<boolean> {
  return verify<{ role: string }>((await cookies()).get("gmit_hod")?.value)?.role === "hod";
}
export async function clearHod() {
  (await cookies()).set("gmit_hod", "", { ...opts, maxAge: 0 });
}
