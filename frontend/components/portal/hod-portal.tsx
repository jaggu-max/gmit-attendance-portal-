"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Building2, BookOpen, History, AlertTriangle, BarChart3, Download, Loader2, Users, CheckCircle2, AlertCircle, UserPlus, Pencil, Save, X, KeyRound, Eye, EyeOff,
} from "lucide-react";
import { PortalShell, GlassCard, type NavItem } from "./portal-shell";
import { readApi, friendly, prettyDate } from "@/lib/clientApi";
import { downloadExcel } from "@/lib/exportExcel";
import { cn } from "@/lib/utils";

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "students", label: "Register Students", icon: UserPlus },
  { key: "sections", label: "Sections", icon: Building2 },
  { key: "subjects", label: "Subjects", icon: BookOpen },
  { key: "history", label: "Attendance History", icon: History },
  { key: "below75", label: "Below 75%", icon: AlertTriangle },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "reports", label: "Reports & Export", icon: Download },
];

const SECTIONS_LIST = ["3A", "3B", "5A", "5B", "7A", "7B"];

const statusColor: Record<string, string> = {
  EXCELLENT: "text-emerald-600", ON_TRACK: "text-indigo-600",
  AT_RISK: "text-amber-600", CRITICAL: "text-rose-600", NOT_STARTED: "text-slate-400",
};

export function HodPortal() {
  const router = useRouter();
  const [tab, setTab] = useState("dashboard");
  const [sections, setSections] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selSection, setSelSection] = useState("3A");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selSubject, setSelSubject] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [allSubjectStudents, setAllSubjectStudents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<any[]>([]);
  const [registeredStudents, setRegisteredStudents] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSaving, setStudentSaving] = useState(false);
  const [studentUsn, setStudentUsn] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentMessage, setStudentMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [editingStudentUsn, setEditingStudentUsn] = useState<string | null>(null);
  const [editingStudentName, setEditingStudentName] = useState("");
  const [studentEditSaving, setStudentEditSaving] = useState(false);
  const [subjectCourseCode, setSubjectCourseCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectTeacher, setSubjectTeacher] = useState("");
  const [subjectConducted, setSubjectConducted] = useState("0");
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [subjectMessage, setSubjectMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [editingSubjectCode, setEditingSubjectCode] = useState<string | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState("");
  const [editingSubjectTeacher, setEditingSubjectTeacher] = useState("");
  const [editingSubjectConducted, setEditingSubjectConducted] = useState("0");
  const [subjectEditSaving, setSubjectEditSaving] = useState(false);
  const [passwordSubject, setPasswordSubject] = useState<any>(null);
  const [facultyPassword, setFacultyPassword] = useState("");
  const [facultyPasswordConfirm, setFacultyPasswordConfirm] = useState("");
  const [showFacultyPassword, setShowFacultyPassword] = useState(false);
  const [showFacultyPasswordConfirm, setShowFacultyPasswordConfirm] = useState(false);
  const [facultyPasswordSaving, setFacultyPasswordSaving] = useState(false);
  const [facultyPasswordMessage, setFacultyPasswordMessage] = useState<{ error: boolean; text: string } | null>(null);
  
  // Below 75% tab state
  const [filterMode, setFilterMode] = useState<"below75" | "above75" | "all">("below75");
  const [subFilter, setSubFilter] = useState<string>("ALL");

  const logout = async () => { await fetch("/gs/hod", { method: "DELETE" }); router.replace("/hod"); };

  // Fetch sections overview
  useEffect(() => {
    readApi("sections")
      .then((j) => setSections(j.sections || {}))
      .catch((e) => setError(friendly(e)))
      .finally(() => setLoading(false));
  }, []);

  // Load section subjects and students across subjects
  const loadSectionData = useCallback(async (s: string) => {
    setSelSection(s);
    setBusy(true);
    setError(null);
    try {
      const j = await readApi("subjects", { section: s });
      const subs = j.subjects || [];
      setSubjects(subs);
      if (subs.length > 0) setSelSubject(subs[0]);

      // Stagger requests to avoid overwhelming the attendance API.
      const studentFetches = await Promise.allSettled(
        subs.map(async (sub: any, idx: number) => {
          if (idx > 0) await new Promise((r) => setTimeout(r, idx * 150));
          const res = await readApi("students", { section: s, courseCode: sub.courseCode });
          return {
            subject: sub,
            students: res.students || [],
            conducted: res.conducted || 0,
          };
        })
      );

      const combined: any[] = [];
      studentFetches.forEach((res) => {
        if (res.status === "fulfilled") {
          const { subject, students: stList } = res.value;
          stList.forEach((st: any) => {
            combined.push({
              ...st,
              courseCode: subject.courseCode,
              subjectName: subject.subject,
              teacher: subject.teacher,
            });
          });
        }
      });
      setAllSubjectStudents(combined);
      if (subs.length > 0 && combined.length > 0) {
        const firstSubStudents = combined.filter((c) => c.courseCode === subs[0].courseCode);
        setStudents(firstSubStudents);
      }
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadSectionData(selSection);
  }, [selSection, loadSectionData]);

  const pickSubject = (sub: any) => {
    setSelSubject(sub);
    const filtered = allSubjectStudents.filter((s) => s.courseCode === sub.courseCode);
    setStudents(filtered);
  };

  const loadHist = useCallback(async (s: string) => {
    setSelSection(s); setBusy(true); setError(null);
    try { const j = await readApi("history", { section: s }); setHist(j.history || []); }
    catch (e) { setError(friendly(e)); } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (tab === "history") loadHist(selSection);
  }, [tab, selSection, loadHist]);

  const loadRegisteredStudents = useCallback(async (section: string) => {
    setStudentsLoading(true);
    setStudentMessage(null);
    try {
      const response = await fetch(`/gs/hod/students?section=${encodeURIComponent(section)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load students.");
      setRegisteredStudents(json.students || []);
    } catch (e) {
      setStudentMessage({ error: true, text: e instanceof Error ? e.message : "Could not load students." });
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "students") loadRegisteredStudents(selSection);
  }, [tab, selSection, loadRegisteredStudents]);

  const registerStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStudentSaving(true);
    setStudentMessage(null);
    try {
      const response = await fetch("/gs/hod/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          section: selSection,
          usn: studentUsn.trim().toUpperCase(),
          name: studentName.trim(),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not register student.");
      setStudentUsn("");
      setStudentName("");
      await loadRegisteredStudents(selSection);
      setStudentMessage({ error: false, text: `${json.student.name} was registered in section ${selSection}.` });
      setSections((current) => ({
        ...current,
        [selSection]: {
          ...current[selSection],
          available: true,
          rows: (current[selSection]?.rows || 0) + 1,
        },
      }));
    } catch (e) {
      setStudentMessage({ error: true, text: e instanceof Error ? e.message : "Could not register student." });
    } finally {
      setStudentSaving(false);
    }
  };

  const saveStudentEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingStudentUsn) return;
    setStudentEditSaving(true);
    setStudentMessage(null);
    try {
      const response = await fetch("/gs/hod/students", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          section: selSection,
          usn: editingStudentUsn,
          name: editingStudentName.trim(),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not update student.");
      setRegisteredStudents((current) =>
        current.map((student) =>
          student.usn === json.student.usn
            ? { ...student, name: json.student.name }
            : student
        )
      );
      setEditingStudentUsn(null);
      setStudentMessage({ error: false, text: `${json.student.usn} details were updated.` });
    } catch (e) {
      setStudentMessage({ error: true, text: e instanceof Error ? e.message : "Could not update student." });
    } finally {
      setStudentEditSaving(false);
    }
  };

  const registerSubject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubjectSaving(true);
    setSubjectMessage(null);
    try {
      const response = await fetch("/gs/hod/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          section: selSection,
          courseCode: subjectCourseCode.trim().toUpperCase(),
          subject: subjectName.trim(),
          teacher: subjectTeacher.trim(),
          conducted: Number(subjectConducted),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not register subject.");
      setSubjectCourseCode("");
      setSubjectName("");
      setSubjectTeacher("");
      setSubjectConducted("0");
      await loadSectionData(selSection);
      setSubjectMessage({
        error: false,
        text: `${json.subject.subject} (${json.subject.courseCode}) was registered for section ${selSection}.`,
      });
    } catch (e) {
      setSubjectMessage({ error: true, text: e instanceof Error ? e.message : "Could not register subject." });
    } finally {
      setSubjectSaving(false);
    }
  };

  const saveSubjectEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingSubjectCode) return;
    setSubjectEditSaving(true);
    setSubjectMessage(null);
    try {
      const response = await fetch("/gs/hod/subjects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          section: selSection,
          courseCode: editingSubjectCode,
          subject: editingSubjectName.trim(),
          teacher: editingSubjectTeacher.trim(),
          conducted: Number(editingSubjectConducted),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not update subject.");
      setEditingSubjectCode(null);
      await loadSectionData(selSection);
      setSubjectMessage({ error: false, text: `${json.subject.courseCode} details were updated.` });
    } catch (e) {
      setSubjectMessage({ error: true, text: e instanceof Error ? e.message : "Could not update subject." });
    } finally {
      setSubjectEditSaving(false);
    }
  };

  const assignFacultyPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordSubject) return;
    if (facultyPassword !== facultyPasswordConfirm) {
      setFacultyPasswordMessage({ error: true, text: "Passwords do not match." });
      return;
    }
    setFacultyPasswordSaving(true);
    setFacultyPasswordMessage(null);
    try {
      const response = await fetch("/gs/hod/faculty-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          section: selSection,
          courseCode: passwordSubject.courseCode,
          password: facultyPassword,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not assign lecturer password.");
      setFacultyPassword("");
      setFacultyPasswordConfirm("");
      setFacultyPasswordMessage({
        error: false,
        text: `Password assigned to ${passwordSubject.teacher} for ${passwordSubject.courseCode}. Share it with the lecturer using a secure channel.`,
      });
    } catch (e) {
      setFacultyPasswordMessage({
        error: true,
        text: e instanceof Error ? e.message : "Could not assign lecturer password.",
      });
    } finally {
      setFacultyPasswordSaving(false);
    }
  };

  const exportExcel = async () => {
    const listToExport = allSubjectStudents.length > 0 ? allSubjectStudents : students;
    if (!listToExport.length) return;
    try {
      await downloadExcel(
        `HOD_${selSection}_attendance_report.xlsx`,
        "Attendance",
        [
          { header: "USN", width: 18 },
          { header: "Name", width: 30 },
          { header: "Course Code", width: 18 },
          { header: "Subject", width: 36 },
          { header: "Teacher", width: 28 },
          { header: "Attended", width: 14, alignment: "right" },
          { header: "Conducted", width: 14, alignment: "right" },
          { header: "Percentage", width: 15, alignment: "right" },
          { header: "Status", width: 18 },
        ],
        listToExport.map((student) => [
          student.usn,
          student.name,
          student.courseCode,
          student.subjectName || selSubject?.subject,
          student.teacher || selSubject?.teacher,
          student.attended,
          student.conducted,
          typeof student.percentage === "number" ? `${student.percentage}%` : "",
          student.status?.replace("_", " "),
        ])
      );
    } catch {
      setError("Could not generate the Excel report. Please try again.");
    }
  };

  const isStudentStarted = (s: any) => (s.conducted > 0) || typeof s.percentage === "number";
  const getStudentPct = (s: any) => typeof s.percentage === "number" ? s.percentage : (s.conducted > 0 ? Math.round((s.attended / s.conducted) * 100) : 0);

  // Filtered students for Below 75% tab
  const sectionStudents = subFilter === "ALL" 
    ? allSubjectStudents 
    : allSubjectStudents.filter((s) => s.courseCode === subFilter);

  const filteredBelowAbove = sectionStudents.filter((s) => {
    const started = isStudentStarted(s);
    const p = getStudentPct(s);
    if (filterMode === "below75") return started && p < 75;
    if (filterMode === "above75") return started && p >= 75;
    return true;
  });

  // Analytics metrics
  const totalStudentsCount = new Set(allSubjectStudents.map((s) => s.usn)).size;
  const startedRecords = allSubjectStudents.filter((s) => isStudentStarted(s));
  const below75Count = startedRecords.filter((s) => getStudentPct(s) < 75).length;
  const above75Count = startedRecords.filter((s) => getStudentPct(s) >= 75).length;
  const overallPct = startedRecords.length
    ? Math.round(startedRecords.reduce((acc, s) => acc + getStudentPct(s), 0) / startedRecords.length)
    : 0;

  return (
    <PortalShell role="HOD" title="Department Overview" subtitle="Roster and attendance management • Live Supabase Integration" nav={NAV} active={tab} onSelect={setTab} onLogout={logout}>
      {error && <GlassCard className="mb-4 text-sm text-rose-600">{error}</GlassCard>}
      {loading ? (
        <GlassCard className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading HOD Portal…</GlassCard>
      ) : tab === "dashboard" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SECTIONS_LIST.map((s) => (
              <button key={s} onClick={() => { setSelSection(s); setTab("sections"); }} className="text-left">
                <GlassCard className="p-4 transition hover:border-emerald-500/50">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-extrabold">{s}</p>
                    <Building2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {sections[s]?.available
                      ? `${sections[s].rows || 0} students · ${Math.max(0, (sections[s].columns || 3) - 3)} subjects`
                      : "Click to view section"}
                  </p>
                </GlassCard>
              </button>
            ))}
          </div>
          <GlassCard className="text-sm text-slate-600">
            Select a section to view attendance data or register students for your department.
          </GlassCard>
        </div>
      ) : tab === "students" ? (
        <div className="space-y-4">
          <GlassCard>
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">Section</p>
            <div className="flex flex-wrap gap-2">
              {SECTIONS_LIST.map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => setSelSection(section)}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm font-bold transition",
                    selSection === section
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-white/60 bg-white/50 dark:bg-white/5"
                  )}
                >
                  {section}
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="text-base font-bold">Register a student</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Add the student&apos;s name and GMIT USN to section {selSection}.
            </p>
            <form onSubmit={registerStudent} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold uppercase text-slate-500">
                Student name
                <input
                  required
                  maxLength={120}
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/60 bg-white/70 px-3 text-sm font-medium normal-case text-slate-900 outline-none focus:border-emerald-600 dark:bg-white/5 dark:text-slate-100"
                  placeholder="Full name"
                />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                USN
                <input
                  required
                  maxLength={10}
                  value={studentUsn}
                  onChange={(event) => setStudentUsn(event.target.value.toUpperCase())}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/60 bg-white/70 px-3 font-mono text-sm font-semibold uppercase text-slate-900 outline-none focus:border-emerald-600 dark:bg-white/5 dark:text-slate-100"
                  placeholder="4GM24CS001"
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={studentSaving}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {studentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {studentSaving ? "Registering…" : "Register student"}
                </button>
              </div>
            </form>
            {studentMessage && (
              <p className={cn("mt-3 text-sm", studentMessage.error ? "text-rose-600" : "text-emerald-700")}>
                {studentMessage.text}
              </p>
            )}
          </GlassCard>

          <GlassCard className="overflow-x-auto p-0">
            <div className="border-b border-white/40 p-4">
              <h2 className="text-sm font-bold">Registered students · {selSection}</h2>
              <p className="mt-1 text-xs text-slate-500">{registeredStudents.length} students</p>
            </div>
            {studentsLoading ? (
              <div className="flex items-center gap-2 p-5 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />Loading students…
              </div>
            ) : registeredStudents.length === 0 ? (
              <p className="p-5 text-sm text-slate-600">No students registered in this section yet.</p>
            ) : (
              <table className="w-full min-w-[420px] text-sm">
                <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                  <tr><th className="p-3">#</th><th className="p-3">USN</th><th className="p-3">Name</th><th className="p-3">Actions</th></tr>
                </thead>
                <tbody>
                  {registeredStudents.map((student, index) => (
                    <tr key={student.usn} className="border-b border-white/20">
                      <td className="p-3 text-slate-500">{student.serial || index + 1}</td>
                      <td className="p-3 font-mono font-semibold">{student.usn}</td>
                      <td className="p-3">
                        {editingStudentUsn === student.usn ? (
                          <form onSubmit={saveStudentEdit} className="flex min-w-48 items-center gap-2">
                            <input
                              required
                              maxLength={120}
                              autoFocus
                              value={editingStudentName}
                              onChange={(event) => setEditingStudentName(event.target.value)}
                              className="h-9 min-w-0 flex-1 rounded-lg border border-white/60 bg-white/70 px-2 text-sm text-slate-900 dark:bg-white/5 dark:text-slate-100"
                            />
                            <button type="submit" disabled={studentEditSaving} aria-label="Save student details" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-50">
                              {studentEditSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            </button>
                            <button type="button" onClick={() => setEditingStudentUsn(null)} aria-label="Cancel student edit" className="rounded-lg p-2 text-slate-500 hover:bg-slate-500/10">
                              <X className="h-4 w-4" />
                            </button>
                          </form>
                        ) : student.name}
                      </td>
                      <td className="p-3">
                        {editingStudentUsn !== student.usn && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudentUsn(student.usn);
                              setEditingStudentName(student.name);
                            }}
                            aria-label={`Edit ${student.usn}`}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-500/10"
                          >
                            <Pencil className="h-3.5 w-3.5" />Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </GlassCard>
        </div>
      ) : tab === "sections" ? (
        <div className="space-y-4">
          <GlassCard>
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">Section</p>
            <div className="flex flex-wrap gap-2">
              {SECTIONS_LIST.map((s) => (
                <button key={s} data-testid={`hod-section-${s}`} onClick={() => setSelSection(s)}
                  className={cn("rounded-xl border px-4 py-2 text-sm font-bold transition", selSection === s ? "border-emerald-600 bg-emerald-600 text-white" : "border-white/60 bg-white/50 dark:bg-white/5")}>{s}</button>
              ))}
            </div>
            {subjects.length > 0 && (
              <>
                <p className="mb-2 mt-4 text-xs font-bold uppercase text-slate-500">Subject</p>
                <div className="flex flex-wrap gap-2">
                  {subjects.map((sub) => (
                    <button key={sub.courseCode || sub.subject} data-testid={`hod-subject-${sub.courseCode}`} onClick={() => pickSubject(sub)}
                      className={cn("rounded-xl border px-3 py-2 text-sm font-semibold transition", selSubject?.courseCode === sub.courseCode ? "border-indigo-600 bg-indigo-600 text-white" : "border-white/60 bg-white/50 dark:bg-white/5")}>
                      {sub.subject} <span className="opacity-70">· {sub.courseCode || "—"}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </GlassCard>

          {busy && <GlassCard className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading section data…</GlassCard>}

          {selSubject && students.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{selSubject.subject} • {selSubject.teacher} • {selSubject.conducted} conducted</p>
                <button onClick={exportExcel} data-testid="hod-export" className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-emerald-700"><Download className="h-4 w-4" />Export Excel</button>
              </div>
              <GlassCard className="overflow-x-auto p-0">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                    <tr><th className="p-3">USN</th><th className="p-3">Name</th><th className="p-3">Attended</th><th className="p-3">Conducted</th><th className="p-3">%</th><th className="p-3">Status</th></tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.usn} className="border-b border-white/20">
                        <td className="p-3 font-semibold">{s.usn}</td><td className="p-3">{s.name}</td>
                        <td className="p-3">{s.attended}</td><td className="p-3">{s.conducted}</td>
                        <td className="p-3 tabular-nums">{s.isStarted ? `${s.percentage}%` : "—"}</td>
                        <td className={cn("p-3 text-xs font-bold", statusColor[s.status])}>{s.status.replace("_", " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassCard>
            </>
          )}
        </div>
      ) : tab === "subjects" ? (
        <div className="space-y-4">
          <GlassCard>
            <h2 className="text-base font-bold">Register a subject</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Add a subject and its lecturer to section {selSection} before taking attendance.
            </p>
            <form onSubmit={registerSubject} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold uppercase text-slate-500">
                Course code
                <input
                  required
                  maxLength={20}
                  value={subjectCourseCode}
                  onChange={(event) => setSubjectCourseCode(event.target.value.toUpperCase())}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/60 bg-white/70 px-3 font-mono text-sm font-semibold uppercase text-slate-900 outline-none focus:border-emerald-600 dark:bg-white/5 dark:text-slate-100"
                  placeholder="21CS51"
                />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                Subject name
                <input
                  required
                  maxLength={120}
                  value={subjectName}
                  onChange={(event) => setSubjectName(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/60 bg-white/70 px-3 text-sm font-medium normal-case text-slate-900 outline-none focus:border-emerald-600 dark:bg-white/5 dark:text-slate-100"
                  placeholder="Subject name"
                />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                Lecturer name
                <input
                  required
                  maxLength={120}
                  value={subjectTeacher}
                  onChange={(event) => setSubjectTeacher(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/60 bg-white/70 px-3 text-sm font-medium normal-case text-slate-900 outline-none focus:border-emerald-600 dark:bg-white/5 dark:text-slate-100"
                  placeholder="Lecturer name"
                />
              </label>
              <label className="text-xs font-bold uppercase text-slate-500">
                Classes already conducted
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={subjectConducted}
                  onChange={(event) => setSubjectConducted(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/60 bg-white/70 px-3 text-sm font-medium text-slate-900 outline-none focus:border-emerald-600 dark:bg-white/5 dark:text-slate-100"
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={subjectSaving}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {subjectSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  {subjectSaving ? "Registering…" : "Register subject"}
                </button>
              </div>
            </form>
            {subjectMessage && (
              <p className={cn("mt-3 text-sm", subjectMessage.error ? "text-rose-600" : "text-emerald-700")}>
                {subjectMessage.text}
              </p>
            )}
          </GlassCard>

          {subjects.length > 0 && (
            <GlassCard className="overflow-x-auto p-0">
              <div className="border-b border-white/40 p-4">
                <h2 className="text-sm font-bold">Registered subjects · {selSection}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Course codes stay fixed because attendance records reference them.
                </p>
              </div>
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                  <tr><th className="p-3">Course code</th><th className="p-3">Subject</th><th className="p-3">Lecturer</th><th className="p-3">Conducted</th><th className="p-3">Actions</th></tr>
                </thead>
                <tbody>
                  {subjects.map((subject) => (
                    <tr key={subject.courseCode} className="border-b border-white/20">
                      <td className="p-3 font-mono font-semibold">{subject.courseCode}</td>
                      {editingSubjectCode === subject.courseCode ? (
                        <>
                          <td className="p-3">
                            <input required maxLength={120} value={editingSubjectName} onChange={(event) => setEditingSubjectName(event.target.value)} className="h-9 w-full rounded-lg border border-white/60 bg-white/70 px-2 text-sm text-slate-900 dark:bg-white/5 dark:text-slate-100" />
                          </td>
                          <td className="p-3">
                            <input required maxLength={120} value={editingSubjectTeacher} onChange={(event) => setEditingSubjectTeacher(event.target.value)} className="h-9 w-full rounded-lg border border-white/60 bg-white/70 px-2 text-sm text-slate-900 dark:bg-white/5 dark:text-slate-100" />
                          </td>
                          <td className="p-3">
                            <input type="number" min={0} step={1} required value={editingSubjectConducted} onChange={(event) => setEditingSubjectConducted(event.target.value)} className="h-9 w-24 rounded-lg border border-white/60 bg-white/70 px-2 text-sm text-slate-900 dark:bg-white/5 dark:text-slate-100" />
                          </td>
                          <td className="p-3">
                            <form onSubmit={saveSubjectEdit} className="flex items-center gap-1">
                              <button type="submit" disabled={subjectEditSaving} aria-label="Save subject details" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-50">
                                {subjectEditSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              </button>
                              <button type="button" onClick={() => setEditingSubjectCode(null)} aria-label="Cancel subject edit" className="rounded-lg p-2 text-slate-500 hover:bg-slate-500/10">
                                <X className="h-4 w-4" />
                              </button>
                            </form>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3">{subject.subject}</td>
                          <td className="p-3">{subject.teacher}</td>
                          <td className="p-3">{subject.conducted}</td>
                          <td className="p-3">
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSubjectCode(subject.courseCode);
                                  setEditingSubjectName(subject.subject);
                                  setEditingSubjectTeacher(subject.teacher);
                                  setEditingSubjectConducted(String(subject.conducted));
                                }}
                                aria-label={`Edit ${subject.courseCode}`}
                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-500/10"
                              >
                                <Pencil className="h-3.5 w-3.5" />Edit details
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPasswordSubject(subject);
                                  setFacultyPassword("");
                                  setFacultyPasswordConfirm("");
                                  setFacultyPasswordMessage(null);
                                }}
                                aria-label={`Assign lecturer password for ${subject.courseCode}`}
                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10"
                              >
                                <KeyRound className="h-3.5 w-3.5" />Set/reset password
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          )}

          {passwordSubject && (
            <GlassCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold">
                    Set lecturer password · {passwordSubject.courseCode}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {passwordSubject.teacher} · Section {selSection}. Passwords are stored as one-way hashes and cannot be viewed later.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordSubject(null);
                    setFacultyPassword("");
                    setFacultyPasswordConfirm("");
                    setFacultyPasswordMessage(null);
                  }}
                  aria-label="Close lecturer password form"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-500/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={assignFacultyPassword} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold uppercase text-slate-500">
                  New password
                  <div className="relative mt-1.5">
                    <input
                      required
                      type={showFacultyPassword ? "text" : "password"}
                      minLength={12}
                      maxLength={72}
                      autoComplete="new-password"
                      value={facultyPassword}
                      onChange={(event) => setFacultyPassword(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/60 bg-white/70 px-3 pr-12 text-sm font-medium normal-case text-slate-900 outline-none focus:border-emerald-600 dark:bg-white/5 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFacultyPassword((visible) => !visible)}
                      aria-label={showFacultyPassword ? "Hide new password" : "Show new password"}
                      aria-pressed={showFacultyPassword}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                    >
                      {showFacultyPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
                <label className="text-xs font-bold uppercase text-slate-500">
                  Confirm password
                  <div className="relative mt-1.5">
                    <input
                      required
                      type={showFacultyPasswordConfirm ? "text" : "password"}
                      minLength={12}
                      maxLength={72}
                      autoComplete="new-password"
                      value={facultyPasswordConfirm}
                      onChange={(event) => setFacultyPasswordConfirm(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/60 bg-white/70 px-3 pr-12 text-sm font-medium normal-case text-slate-900 outline-none focus:border-emerald-600 dark:bg-white/5 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFacultyPasswordConfirm((visible) => !visible)}
                      aria-label={showFacultyPasswordConfirm ? "Hide password confirmation" : "Show password confirmation"}
                      aria-pressed={showFacultyPasswordConfirm}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                    >
                      {showFacultyPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500">
                    Use 12–72 characters with uppercase, lowercase, a number, and a symbol. Use a unique password for each subject.
                  </p>
                  <button
                    type="submit"
                    disabled={facultyPasswordSaving}
                    className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {facultyPasswordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    {facultyPasswordSaving ? "Saving password…" : "Assign password"}
                  </button>
                </div>
              </form>
              {facultyPasswordMessage && (
                <p className={cn("mt-3 text-sm", facultyPasswordMessage.error ? "text-rose-600" : "text-emerald-700")}>
                  {facultyPasswordMessage.text}
                </p>
              )}
            </GlassCard>
          )}

          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-slate-500">Select Section</p>
                <div className="flex flex-wrap gap-2">
                  {SECTIONS_LIST.map((s) => (
                    <button key={s} onClick={() => setSelSection(s)}
                      className={cn("rounded-xl border px-4 py-2 text-sm font-bold transition", selSection === s ? "border-emerald-600 bg-emerald-600 text-white" : "border-white/60 bg-white/50 dark:bg-white/5")}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-slate-500">Subject Filter</p>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setSubFilter("ALL")} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", subFilter === "ALL" ? "bg-indigo-600 text-white" : "bg-white/60 dark:bg-white/5")}>All Subjects</button>
                  {subjects.map((sub, idx) => (
                    <button key={sub.courseCode ? `${sub.courseCode}-${idx}` : `sub-${idx}`} onClick={() => setSubFilter(sub.courseCode)}
                      className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", subFilter === sub.courseCode ? "bg-indigo-600 text-white" : "bg-white/60 dark:bg-white/5")}>
                      {sub.courseCode || sub.subject}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          {busy ? (
            <GlassCard className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading all subjects view…</GlassCard>
          ) : sectionStudents.length === 0 ? (
            <GlassCard className="text-sm text-slate-600">No subject records found for section {selSection}.</GlassCard>
          ) : (
            <GlassCard className="overflow-x-auto p-0">
              <div className="p-4 border-b border-white/40 flex items-center justify-between">
                <p className="text-sm font-bold">Section {selSection} • All Subjects ({sectionStudents.length} records)</p>
                <button onClick={exportExcel} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Download className="h-3.5 w-3.5" />Export Excel</button>
              </div>
              <table className="w-full min-w-[780px] text-sm">
                <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">USN</th><th className="p-3">Student Name</th><th className="p-3">Course Code</th>
                    <th className="p-3">Subject</th><th className="p-3">Teacher</th><th className="p-3">Present</th>
                    <th className="p-3">Conducted</th><th className="p-3">%</th><th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionStudents.map((s, idx) => (
                    <tr key={`${s.usn}-${s.courseCode}-${idx}`} className="border-b border-white/20">
                      <td className="p-3 font-semibold">{s.usn}</td>
                      <td className="p-3">{s.name}</td>
                      <td className="p-3 font-mono text-xs font-bold">{s.courseCode}</td>
                      <td className="p-3">{s.subjectName}</td>
                      <td className="p-3 text-slate-600">{s.teacher}</td>
                      <td className="p-3 text-emerald-600 font-semibold">{s.attended}</td>
                      <td className="p-3">{s.conducted}</td>
                      <td className="p-3 font-bold tabular-nums">{s.isStarted ? `${s.percentage}%` : "—"}</td>
                      <td className={cn("p-3 text-xs font-bold", statusColor[s.status])}>{s.status?.replace("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          )}
        </div>
      ) : tab === "below75" ? (
        <div className="space-y-4">
          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-slate-500">Section</p>
                <div className="flex flex-wrap gap-2">
                  {SECTIONS_LIST.map((s) => (
                    <button key={s} onClick={() => setSelSection(s)}
                      className={cn("rounded-xl border px-4 py-2 text-sm font-bold transition", selSection === s ? "border-emerald-600 bg-emerald-600 text-white" : "border-white/60 bg-white/50 dark:bg-white/5")}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-slate-500">Filter Status</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setFilterMode("below75")} data-testid="filter-below-75"
                    className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", filterMode === "below75" ? "bg-rose-600 text-white" : "bg-white/60 dark:bg-white/5")}>Below 75%</button>
                  <button onClick={() => setFilterMode("above75")} data-testid="filter-above-75"
                    className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", filterMode === "above75" ? "bg-emerald-600 text-white" : "bg-white/60 dark:bg-white/5")}>75% & Above</button>
                  <button onClick={() => setFilterMode("all")} data-testid="filter-all"
                    className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", filterMode === "all" ? "bg-indigo-600 text-white" : "bg-white/60 dark:bg-white/5")}>All</button>
                </div>
              </div>
            </div>
          </GlassCard>

          {busy ? (
            <GlassCard className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading data…</GlassCard>
          ) : filteredBelowAbove.length === 0 ? (
            <GlassCard className="text-sm text-slate-600">No students match the "{filterMode}" criteria in section {selSection}.</GlassCard>
          ) : (
            <GlassCard className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">USN</th><th className="p-3">Name</th><th className="p-3">Course Code</th>
                    <th className="p-3">Subject</th><th className="p-3">Present</th><th className="p-3">Conducted</th>
                    <th className="p-3">%</th><th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBelowAbove.map((s, idx) => (
                    <tr key={`${s.usn}-${s.courseCode}-${idx}`} className="border-b border-white/20">
                      <td className="p-3 font-semibold">{s.usn}</td>
                      <td className="p-3">{s.name}</td>
                      <td className="p-3 font-mono text-xs font-bold">{s.courseCode}</td>
                      <td className="p-3">{s.subjectName}</td>
                      <td className="p-3 font-semibold">{s.attended}</td>
                      <td className="p-3">{s.conducted}</td>
                      <td className={cn("p-3 font-bold tabular-nums", s.percentage < 75 ? "text-rose-600" : "text-emerald-600")}>
                        {s.isStarted ? `${s.percentage}%` : "—"}
                      </td>
                      <td className={cn("p-3 text-xs font-bold", statusColor[s.status])}>{s.status?.replace("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          )}
        </div>
      ) : tab === "history" ? (
        <div className="space-y-4">
          <GlassCard>
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">Section</p>
            <div className="flex flex-wrap gap-2">
              {SECTIONS_LIST.map((s) => (
                <button key={s} onClick={() => setSelSection(s)} className={cn("rounded-xl border px-4 py-2 text-sm font-bold transition", selSection === s ? "border-emerald-600 bg-emerald-600 text-white" : "border-white/60 bg-white/50 dark:bg-white/5")}>{s}</button>
              ))}
            </div>
          </GlassCard>
          {busy ? <GlassCard className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading history…</GlassCard>
            : hist.length === 0 ? <GlassCard className="text-sm text-slate-600">No attendance history records found for section {selSection}.</GlassCard>
            : (
              <GlassCard className="overflow-x-auto p-0">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                    <tr><th className="p-3">Date</th><th className="p-3">Subject</th><th className="p-3">Teacher</th><th className="p-3">Present</th><th className="p-3">Absent</th><th className="p-3">Conducted</th></tr>
                  </thead>
                  <tbody>
                    {hist.map((h, i) => (
                      <tr key={i} className="border-b border-white/20">
                        <td className="p-3 font-semibold">{prettyDate(h.date)}</td><td className="p-3">{h.subject}</td>
                        <td className="p-3">{h.teacher}</td><td className="p-3 text-emerald-600 font-semibold">{h.present}</td>
                        <td className="p-3 text-rose-600 font-semibold">{h.absent}</td><td className="p-3">{h.conducted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassCard>
            )}
        </div>
      ) : tab === "analytics" ? (
        <div className="space-y-4">
          <GlassCard>
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">Select Section</p>
            <div className="flex flex-wrap gap-2">
              {SECTIONS_LIST.map((s) => (
                <button key={s} onClick={() => setSelSection(s)} className={cn("rounded-xl border px-4 py-2 text-sm font-bold transition", selSection === s ? "border-emerald-600 bg-emerald-600 text-white" : "border-white/60 bg-white/50 dark:bg-white/5")}>{s}</button>
              ))}
            </div>
          </GlassCard>

          {busy ? (
            <GlassCard className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Calculating analytics…</GlassCard>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <GlassCard className="p-4">
                  <p className="text-xs font-bold uppercase text-slate-500">Total Students</p>
                  <p className="mt-1 text-2xl font-extrabold">{totalStudentsCount}</p>
                </GlassCard>
                <GlassCard className="p-4">
                  <p className="text-xs font-bold uppercase text-slate-500">Average %</p>
                  <p className="mt-1 text-2xl font-extrabold text-indigo-600">{overallPct}%</p>
                </GlassCard>
                <GlassCard className="p-4">
                  <p className="text-xs font-bold uppercase text-slate-500">Below 75%</p>
                  <p className="mt-1 text-2xl font-extrabold text-rose-600">{below75Count}</p>
                </GlassCard>
                <GlassCard className="p-4">
                  <p className="text-xs font-bold uppercase text-slate-500">75% & Above</p>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-600">{above75Count}</p>
                </GlassCard>
              </div>

              <GlassCard className="p-5">
                <h3 className="mb-4 text-base font-bold">Subject-Wise Analytics Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                      <tr><th className="p-3">Course</th><th className="p-3">Subject</th><th className="p-3">Teacher</th><th className="p-3">Conducted</th><th className="p-3">Below 75% Count</th></tr>
                    </thead>
                    <tbody>
                      {subjects.map((sub, i) => {
                        const subSt = allSubjectStudents.filter((s) => s.courseCode === sub.courseCode);
                        const subBelow = subSt.filter((s) => s.isStarted && s.percentage < 75).length;
                        return (
                          <tr key={sub.courseCode ? `${sub.courseCode}-${i}` : `sub-${i}`} className="border-b border-white/20">
                            <td className="p-3 font-mono font-bold text-xs">{sub.courseCode || "—"}</td>
                            <td className="p-3 font-semibold">{sub.subject}</td>
                            <td className="p-3 text-slate-600">{sub.teacher}</td>
                            <td className="p-3">{sub.conducted}</td>
                            <td className="p-3 font-bold text-rose-600">{subBelow}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </>
          )}
        </div>
      ) : (
        /* Reports & Export tab */
        <div className="space-y-4">
          <GlassCard className="p-6">
            <h3 className="mb-2 text-lg font-bold">Export Section Attendance Report</h3>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Download complete student attendance records as a formatted Excel workbook for Section {selSection}.</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-2">
                {SECTIONS_LIST.map((s) => (
                  <button key={s} onClick={() => setSelSection(s)} className={cn("rounded-xl border px-3 py-1.5 text-sm font-bold transition", selSection === s ? "border-emerald-600 bg-emerald-600 text-white" : "border-white/60 bg-white/50 dark:bg-white/5")}>{s}</button>
                ))}
              </div>
              <button onClick={exportExcel} className="ml-auto flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white transition hover:bg-emerald-700">
                <Download className="h-4 w-4" /> Export Excel ({allSubjectStudents.length} records)
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </PortalShell>
  );
}
