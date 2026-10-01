"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck, History, AlertTriangle, BarChart3, Search,
  Check, X, RotateCcw, Pencil, Eye, Loader2, Users, Download, Trash2,
} from "lucide-react";
import { PortalShell, GlassCard, type NavItem } from "./portal-shell";
import { readApi, writeApi, friendly, todayISO, prettyDate } from "@/lib/clientApi";
import { downloadExcel } from "@/lib/exportExcel";
import { cn } from "@/lib/utils";
import type { FacultySession } from "@/lib/roles-auth";

const NAV: NavItem[] = [
  { key: "mark", label: "Mark Attendance", icon: ClipboardCheck },
  { key: "history", label: "Attendance History", icon: History },
  { key: "below75", label: "Below 75%", icon: AlertTriangle },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "students", label: "Students", icon: Users },
  { key: "export", label: "Export Data", icon: Download },
];

type Mark = "P" | "A";

const statusColor: Record<string, string> = {
  EXCELLENT: "text-emerald-600", ON_TRACK: "text-indigo-600",
  AT_RISK: "text-amber-600", CRITICAL: "text-rose-600", NOT_STARTED: "text-slate-400",
};

export function LecturerPortal({ faculty }: { faculty: FacultySession }) {
  const router = useRouter();
  const [tab, setTab] = useState("mark");
  const [date, setDate] = useState(todayISO());
  const [students, setStudents] = useState<any[]>([]);
  const [conducted, setConducted] = useState(0);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [search, setSearch] = useState("");
  const [hist, setHist] = useState<any[]>([]);
  const [viewData, setViewData] = useState<{ date: string; attendance: Record<string, string> } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editLogId, setEditLogId] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<"below75" | "above75" | "all">("below75");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  const loadStudents = useCallback(async () => {
    try {
      const res = await readApi("students", { section: faculty.section, courseCode: faculty.courseCode });
      if (res.students) {
        setStudents(res.students);
        setConducted(res.conducted || 0);
        if (!editing) {
          const initial: Record<string, Mark> = {};
          res.students.forEach((s: any) => { initial[s.usn] = "P"; });
          setMarks(initial);
        }
      }
    } catch (e) {
      setError(friendly(e));
    }
  }, [faculty.section, faculty.courseCode, editing]);

  const loadHistory = useCallback(async () => {
    const cacheKey = `gmit_hist_${faculty.section}_${faculty.courseCode}`;
    try {
      const res = await readApi("history", { section: faculty.section, courseCode: faculty.courseCode });
      if (res.history) {
        setHist(res.history);
        try { localStorage.setItem(cacheKey, JSON.stringify(res.history)); } catch {}
      }
    } catch {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) setHist(JSON.parse(cached));
      } catch {}
    }
  }, [faculty.section, faculty.courseCode]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStudents(), loadHistory()]).finally(() => setLoading(false));
  }, [loadStudents, loadHistory]);

  const logout = async () => { await fetch("/gs/faculty/session", { method: "DELETE" }); router.replace("/lecturer"); };

  const total = students.length;
  const present = Object.values(marks).filter((m) => m === "P").length;
  const absent = total - present;
  const classPct = total ? Math.round((present / total) * 10000) / 100 : 0;

  const setAll = (m: Mark) => { const n: Record<string, Mark> = {}; students.forEach((s) => (n[s.usn] = m)); setMarks(n); };
  const toggle = (usn: string, m: Mark) => setMarks((p) => ({ ...p, [usn]: m }));

  const filtered = students.filter((s) =>
    !search || s.usn.includes(search.toUpperCase()) || s.name.toUpperCase().includes(search.toUpperCase()));

  const submit = async () => {
    if (!total) { flash("No students loaded."); return; }
    setBusy(true);
    try {
      const action = editing ? "updateAttendance" : "submitAttendance";
      const payload: any = {
        action,
        section: faculty.section,
        courseCode: faculty.courseCode,
        date,
        attendance: marks,
      };
      if (editing && editLogId) {
        payload.logId = editLogId;
      }
      const j = await writeApi(payload);
      flash(editing ? "Attendance updated." : `Submitted • ${j.present || present} present, ${j.absent || absent} absent.`);
      setEditing(false);
      setEditLogId(null);
      await Promise.all([loadStudents(), loadHistory()]);
      setTab("history");
    } catch (e: any) {
      flash(friendly(e));
    } finally { setBusy(false); }
  };

  const startEdit = async (h: any) => {
    setBusy(true);
    try {
      const j = await readApi("attendance", {
        section: faculty.section,
        courseCode: faculty.courseCode,
        date: h.date,
        logId: String(h.logId || ""),
      });
      const m: Record<string, Mark> = {};
      students.forEach((s) => { m[s.usn] = (j.attendance?.[s.usn] === "P" ? "P" : "A"); });
      setMarks(m);
      setDate(h.date);
      setEditLogId(h.logId || null);
      setEditing(true);
      setViewData(null);
      setTab("mark");
    } catch (e) { flash(friendly(e)); } finally { setBusy(false); }
  };

  const view = async (h: any) => {
    setBusy(true);
    try {
      const j = await readApi("attendance", {
        section: faculty.section,
        courseCode: faculty.courseCode,
        date: h.date,
        logId: String(h.logId || ""),
      });
      setViewData({ date: h.date, attendance: j.attendance || {} });
    } catch (e) { flash(friendly(e)); } finally { setBusy(false); }
  };

  const undo = async (h: any) => {
    if (!confirm(`Undo attendance for ${faculty.subject} • ${faculty.section} • ${prettyDate(h.date)}? This reverses its attendance totals.`)) return;
    setBusy(true);
    try {
      await writeApi({
        action: "undoAttendance",
        section: faculty.section,
        courseCode: faculty.courseCode,
        date: h.date,
        logId: h.logId,
      });
      flash("Attendance undone.");
      await Promise.all([loadStudents(), loadHistory()]);
    } catch (e) { flash(friendly(e)); } finally { setBusy(false); }
  };

  const del = async (h: any) => {
    if (!confirm(`Delete attendance record for ${faculty.subject} • ${faculty.section} • ${prettyDate(h.date)}? This reverses its attendance totals.`)) return;
    setBusy(true);
    try {
      await writeApi({
        action: "deleteAttendance",
        section: faculty.section,
        courseCode: faculty.courseCode,
        date: h.date,
        logId: h.logId,
      });
      flash("Attendance record deleted and Sheet totals updated.");
      await Promise.all([loadStudents(), loadHistory()]);
    } catch (e) { flash(friendly(e)); } finally { setBusy(false); }
  };

  const exportExcel = async () => {
    if (!students.length) return;
    try {
      await downloadExcel(
        `${faculty.section}_${faculty.courseCode}_attendance.xlsx`,
        "Attendance",
        [
          { header: "USN", width: 18 },
          { header: "Name", width: 32 },
          { header: "Attended", width: 14, alignment: "right" },
          { header: "Conducted", width: 14, alignment: "right" },
          { header: "Percentage", width: 15, alignment: "right" },
          { header: "Status", width: 18 },
        ],
        students.map((student) => [
          student.usn,
          student.name,
          student.attended,
          student.conducted,
          `${getPct(student)}%`,
          student.status?.replace("_", " "),
        ])
      );
    } catch {
      flash("Could not generate the Excel report. Please try again.");
    }
  };

  const isStarted = (s: any) => (s.conducted > 0) || typeof s.percentage === "number";
  const getPct = (s: any) => typeof s.percentage === "number" ? s.percentage : (s.conducted > 0 ? Math.round((s.attended / s.conducted) * 100) : 0);

  const filteredBelowAbove = students.filter((s) => {
    const started = isStarted(s);
    const p = getPct(s);
    if (filterMode === "below75") return started && p < 75;
    if (filterMode === "above75") return started && p >= 75;
    return true;
  });

  const below = students.filter((s) => isStarted(s) && getPct(s) < 75);
  const startedStudents = students.filter((s) => isStarted(s));
  const avg = startedStudents.length
    ? Math.round(startedStudents.reduce((a, s) => a + getPct(s), 0) / startedStudents.length)
    : 0;

  const meta = `${faculty.subject} • ${faculty.courseCode} • ${faculty.section} • ${faculty.teacher} • ${conducted} conducted`;

  return (
    <PortalShell role="Lecturer" title={faculty.subject} subtitle={meta} nav={NAV} active={tab} onSelect={setTab} onLogout={logout}>
      {toast && <div data-testid="lec-toast" className="mb-4 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>}
      {error && <GlassCard className="mb-4 text-sm text-rose-600" >{error}</GlassCard>}

      {loading ? (
        <GlassCard className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading students…</GlassCard>
      ) : tab === "mark" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Students" value={total} icon />
            <Stat label="Present" value={present} tone="emerald" />
            <Stat label="Absent" value={absent} tone="rose" />
            <Stat label="Class %" value={`${classPct}%`} tone="indigo" />
          </div>

          <GlassCard>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="mr-2 text-sm font-semibold">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="lec-date"
                  className="rounded-lg border border-white/60 bg-white/60 px-3 py-1.5 text-sm dark:bg-white/5" />
                {editing && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-600">EDITING</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAll("P")} data-testid="mark-all-present" className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-bold text-emerald-600 transition hover:bg-emerald-500/25"><Check className="h-4 w-4" /> Mark All Present</button>
                <button onClick={() => setAll("A")} data-testid="mark-all-absent" className="flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1.5 text-sm font-bold text-rose-600 transition hover:bg-rose-500/25"><X className="h-4 w-4" /> Mark All Absent</button>
              </div>
              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search USN or name" data-testid="lec-search"
                  className="rounded-lg border border-white/60 bg-white/60 py-1.5 pl-9 pr-3 text-sm dark:bg-white/5" />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">USN</th>
                  <th className="p-3">Name</th>
                  <th className="p-3 text-center">Today Attendance</th>
                  <th className="p-3">Current</th>
                  <th className="p-3">%</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const p = getPct(s);
                  const st = isStarted(s);
                  return (
                    <tr key={s.usn} className="border-b border-white/20" data-testid={`lec-row-${s.usn}`}>
                      <td className="p-3 text-slate-400">{i + 1}</td>
                      <td className="p-3 font-semibold">{s.usn}</td>
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggle(s.usn, "P")}
                            data-testid={`present-${s.usn}`}
                            className={cn(
                              "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition",
                              marks[s.usn] === "P"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "bg-white/60 text-slate-600 hover:bg-emerald-500/15 hover:text-emerald-600 dark:bg-white/5"
                            )}
                          >
                            <Check className="h-3.5 w-3.5" /> Present
                          </button>
                          <button
                            type="button"
                            onClick={() => toggle(s.usn, "A")}
                            data-testid={`absent-${s.usn}`}
                            className={cn(
                              "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition",
                              marks[s.usn] === "A"
                                ? "bg-rose-600 text-white shadow-sm"
                                : "bg-white/60 text-slate-600 hover:bg-rose-500/15 hover:text-rose-600 dark:bg-white/5"
                            )}
                          >
                            <X className="h-3.5 w-3.5" /> Absent
                          </button>
                        </div>
                      </td>
                      <td className="p-3 tabular-nums">{s.attended}/{s.conducted}</td>
                      <td className="p-3 tabular-nums">{st ? `${p}%` : "—"}</td>
                      <td className={cn("p-3 text-xs font-bold", statusColor[s.status || "NOT_STARTED"])}>
                        {(s.status || "NOT_STARTED").replace("_", " ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlassCard>

          <button onClick={submit} disabled={busy} data-testid="submit-attendance"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-5 w-5" />}
            {editing ? "Update Attendance" : "Submit Attendance"}
          </button>
        </div>
      ) : tab === "history" ? (
        <div className="space-y-4">
          {viewData && (
            <GlassCard>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-bold">Viewing {prettyDate(viewData.date)}</p>
                <button onClick={() => setViewData(null)}><X className="h-4 w-4" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {students.map((s) => (
                  <span key={s.usn} className={cn("rounded-lg px-2 py-1 text-xs font-semibold", viewData.attendance[s.usn] === "P" ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600")}>{s.usn}:{viewData.attendance[s.usn] || "A"}</span>
                ))}
              </div>
            </GlassCard>
          )}
          {loading ? (
            <GlassCard className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading history…</GlassCard>
          ) : hist.length === 0 ? (
            <GlassCard className="text-sm text-slate-600">No attendance history yet for this subject.</GlassCard>
          ) : (
            <GlassCard className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Section</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Teacher</th>
                    <th className="p-3">Present</th>
                    <th className="p-3">Absent</th>
                    <th className="p-3">Conducted</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {hist.map((h, i) => (
                    <tr key={i} className="border-b border-white/20" data-testid={`hist-row-${h.date}`}>
                      <td className="p-3 font-semibold">{prettyDate(h.date)}</td>
                      <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">Class {h.sessionNumber || 1}</td>
                      <td className="p-3">{h.section || faculty.section}</td>
                      <td className="p-3">{h.subject || faculty.subject}</td>
                      <td className="p-3 text-xs">{h.teacher || faculty.teacher}</td>
                      <td className="p-3 font-semibold text-emerald-600">{h.present}</td>
                      <td className="p-3 font-semibold text-rose-600">{h.absent}</td>
                      <td className="p-3 tabular-nums">{h.conducted}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => view(h)} data-testid={`view-${h.date}`} className="rounded-lg bg-white/60 p-2 text-slate-600 hover:bg-white dark:bg-white/5" title="View"><Eye className="h-4 w-4" /></button>
                          <button onClick={() => startEdit(h)} data-testid={`edit-${h.date}`} className="rounded-lg bg-indigo-500/15 p-2 text-indigo-600 hover:bg-indigo-500/25" title="Edit"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => undo(h)} data-testid={`undo-${h.date}`} className="rounded-lg bg-rose-500/15 p-2 text-rose-600 hover:bg-rose-500/25" title="Undo"><RotateCcw className="h-4 w-4" /></button>
                          <button onClick={() => del(h)} data-testid={`del-${h.date}`} className="rounded-lg bg-rose-500/15 p-2 text-rose-600 hover:bg-rose-500/25" title="Delete"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
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
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase text-slate-500">Attendance Filter</p>
              <div className="flex gap-1.5">
                <button onClick={() => setFilterMode("below75")}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", filterMode === "below75" ? "bg-rose-600 text-white" : "bg-white/60 dark:bg-white/5")}>Below 75%</button>
                <button onClick={() => setFilterMode("above75")}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", filterMode === "above75" ? "bg-emerald-600 text-white" : "bg-white/60 dark:bg-white/5")}>75% & Above</button>
                <button onClick={() => setFilterMode("all")}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", filterMode === "all" ? "bg-indigo-600 text-white" : "bg-white/60 dark:bg-white/5")}>All</button>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="overflow-x-auto p-0">
            {filteredBelowAbove.length === 0 ? (
              <p className="p-5 text-sm text-slate-600">No students match the "{filterMode}" criteria.</p>
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                  <tr><th className="p-3">USN</th><th className="p-3">Name</th><th className="p-3">Attended</th><th className="p-3">Conducted</th><th className="p-3">%</th><th className="p-3">Status</th></tr>
                </thead>
                <tbody>
                  {filteredBelowAbove.map((s) => {
                    const p = getPct(s);
                    return (
                      <tr key={s.usn} className="border-b border-white/20">
                        <td className="p-3 font-semibold">{s.usn}</td>
                        <td className="p-3">{s.name}</td>
                        <td className="p-3">{s.attended}</td>
                        <td className="p-3">{s.conducted}</td>
                        <td className={cn("p-3 font-bold tabular-nums", p < 75 ? "text-rose-600" : "text-emerald-600")}>{p}%</td>
                        <td className={cn("p-3 text-xs font-bold", statusColor[s.status || "NOT_STARTED"])}>{(s.status || "NOT_STARTED").replace("_", " ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </GlassCard>
        </div>
      ) : tab === "analytics" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total Students" value={total} icon />
            <Stat label="Avg Attendance" value={`${Math.round(avg * 100) / 100 || 0}%`} tone="indigo" />
            <Stat label="Below 75%" value={below.length} tone="rose" />
            <Stat label="Classes Conducted" value={conducted} tone="emerald" />
          </div>

          <GlassCard className="p-5">
            <h3 className="mb-3 text-base font-bold">Class Attendance Distribution</h3>
            <div className="space-y-3 text-sm">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>75% & Above ({total - below.length} students)</span>
                  <span className="text-emerald-600">{total ? Math.round(((total - below.length) / total) * 100) : 0}%</span>
                </div>
                <div className="h-3.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${total ? ((total - below.length) / total) * 100 : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Below 75% ({below.length} students)</span>
                  <span className="text-rose-600">{total ? Math.round((below.length / total) * 100) : 0}%</span>
                </div>
                <div className="h-3.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: `${total ? (below.length / total) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      ) : tab === "students" ? (
        <div className="space-y-4">
          <GlassCard>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter students by USN or name..."
                className="w-full rounded-xl border border-white/60 bg-white/60 py-2 pl-9 pr-4 text-sm font-medium outline-none dark:bg-white/5" />
            </div>
          </GlassCard>

          <GlassCard className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-white/40 text-left text-xs uppercase text-slate-500">
                <tr><th className="p-3">USN</th><th className="p-3">Name</th><th className="p-3">Attended</th><th className="p-3">Conducted</th><th className="p-3">%</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const p = getPct(s);
                  const st = isStarted(s);
                  return (
                    <tr key={s.usn} className="border-b border-white/20">
                      <td className="p-3 font-semibold">{s.usn}</td>
                      <td className="p-3">{s.name}</td>
                      <td className="p-3 font-semibold text-emerald-600">{s.attended}</td>
                      <td className="p-3">{s.conducted}</td>
                      <td className="p-3 font-bold tabular-nums">{st ? `${p}%` : "—"}</td>
                      <td className={cn("p-3 text-xs font-bold", statusColor[s.status || "NOT_STARTED"])}>{(s.status || "NOT_STARTED").replace("_", " ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlassCard>
        </div>
      ) : (
        /* Export tab */
        <GlassCard className="p-6">
          <h3 className="mb-2 text-lg font-bold">Export Attendance Data</h3>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Download section {faculty.section} • {faculty.courseCode} attendance data as a formatted Excel workbook.</p>
          <button onClick={exportExcel} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white transition hover:bg-indigo-700">
            <Download className="h-4 w-4" /> Download Excel ({students.length} students)
          </button>
        </GlassCard>
      )}
    </PortalShell>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: string | number; tone?: string; icon?: boolean }) {
  const c = tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : tone === "indigo" ? "text-indigo-600" : "text-slate-900 dark:text-slate-100";
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500">{icon && <Users className="h-3.5 w-3.5" />}{label}</div>
      <p className={cn("mt-1 text-2xl font-extrabold tabular-nums", c)}>{value}</p>
    </GlassCard>
  );
}
