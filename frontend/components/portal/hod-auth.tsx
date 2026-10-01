"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Loader2, AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";

export function HodAuth() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const res = await fetch("/gs/hod", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ passcode }) });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Access denied."); setLoading(false); return; }
      router.push("/hod/portal");
    } catch { setError("Network error."); setLoading(false); }
  };

  return (
    <main className="portal-bg font-jakarta flex min-h-screen items-center justify-center p-6 text-slate-900 dark:text-slate-100">
      <form onSubmit={submit} className="glass w-full max-w-md rounded-3xl p-8 shadow-xl" data-testid="hod-auth-form">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Building2 className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-extrabold">HOD / Admin Portal</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">Department overview and student registration</p>
          </div>
        </div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Passcode</label>
        <div className="relative">
          <input type={showPasscode ? "text" : "password"} value={passcode} onChange={(e) => setPasscode(e.target.value)} data-testid="hod-passcode"
            className="h-12 w-full rounded-xl border border-white/60 bg-white/60 px-4 pr-12 font-semibold outline-none focus:border-emerald-600 dark:bg-white/5" placeholder="••••••••" />
          <button type="button" onClick={() => setShowPasscode((visible) => !visible)}
            aria-label={showPasscode ? "Hide passcode" : "Show passcode"}
            aria-pressed={showPasscode}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
            {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && <div data-testid="hod-auth-error" className="mt-4 flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm text-rose-600"><AlertCircle className="mt-0.5 h-4 w-4" /><span>{error}</span></div>}
        <button type="submit" disabled={loading} data-testid="hod-auth-submit"
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</> : <>Enter<ArrowRight className="h-4 w-4" /></>}
        </button>
        <div className="mt-5 flex justify-between text-xs font-semibold text-slate-500">
          <Link href="/" className="hover:text-emerald-600">← Student login</Link>
          <Link href="/lecturer" className="hover:text-emerald-600">Lecturer portal →</Link>
        </div>
      </form>
    </main>
  );
}
