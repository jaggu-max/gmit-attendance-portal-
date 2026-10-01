"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2, AlertCircle, GraduationCap, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { friendly } from "@/lib/clientApi";

const SECTIONS = ["3A", "3B", "5A", "5B", "7A", "7B"];

export function LecturerAuth() {
  const router = useRouter();
  const [section, setSection] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!section || !password) { setError("Select a section and enter your password."); return; }
    setLoading(true);
    try {
      const res = await fetch("/gs/faculty/authorize", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ section, password }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.code === "API_NOT_DEPLOYED" ? friendly(json) : (json.error || "Authorization failed.")); setLoading(false); return; }
      router.push("/lecturer/portal");
    } catch { setError("Network error. Please try again."); setLoading(false); }
  };

  return (
    <main className="portal-bg font-jakarta flex min-h-screen items-center justify-center p-6 text-slate-900 dark:text-slate-100">
      <form onSubmit={submit} className="glass w-full max-w-md rounded-3xl p-8 shadow-xl" data-testid="lecturer-auth-form">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">Lecturer Portal</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">Authorize your subject to continue</p>
          </div>
        </div>

        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Section</label>
        <div className="grid grid-cols-3 gap-2">
          {SECTIONS.map((s) => (
            <button key={s} type="button" data-testid={`lec-section-${s}`} onClick={() => setSection(s)} suppressHydrationWarning
              className={cn("h-11 rounded-xl border text-sm font-bold transition",
                section === s ? "border-indigo-600 bg-indigo-600 text-white" : "border-white/60 bg-white/50 hover:bg-white/80 dark:bg-white/5")}>
              {s}
            </button>
          ))}
        </div>

        <label className="mb-2 mt-5 block text-xs font-bold uppercase tracking-wide text-slate-500">Password</label>
        <div className="relative">
          <input data-testid="lec-course-input" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter lecturer password" autoCapitalize="none" autoComplete="current-password" spellCheck={false} suppressHydrationWarning
            className="h-12 w-full rounded-xl border border-white/60 bg-white/60 px-4 pr-12 font-semibold tracking-wide outline-none focus:border-indigo-600 dark:bg-white/5" />
          <button type="button" onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <div data-testid="lec-auth-error" className="mt-4 flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm text-rose-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={loading} data-testid="lec-auth-submit" suppressHydrationWarning
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Authorizing…</> : <>Continue<ArrowRight className="h-4 w-4" /></>}
        </button>

        <div className="mt-5 flex justify-between text-xs font-semibold text-slate-500">
          <Link href="/" className="hover:text-indigo-600">← Student login</Link>
          <Link href="/hod" className="hover:text-indigo-600">HOD portal →</Link>
        </div>
      </form>
    </main>
  );
}
