"use client";

import { useRouter } from "next/navigation";
import { useAttendance } from "@/components/attendance-provider";
import { ProfileAvatar } from "@/components/profile-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatusBadge } from "@/components/status-badge";
import { ListSkeleton } from "@/components/skeletons";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { STATUS_THEME } from "@/lib/status";
import { formatPct } from "@/lib/utils";
import { LogOut, GraduationCap } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const { data, loading, error, refresh, refreshing } = useAttendance();

  if (loading && !data) return <ListSkeleton />;
  if (error && !data)
    return <ErrorState message={error} onRetry={refresh} retrying={refreshing} />;
  if (!data) return null;

  const { student, overall, subjects } = data;
  const theme = STATUS_THEME[overall.displayStatus];

  const logout = async () => {
    await fetch("/gs/auth/logout", { method: "POST", credentials: "same-origin" });
    router.replace("/");
  };

  return (
    <div className="space-y-7 animate-fade-up">
      {/* Identity card */}
      <section className="relative overflow-hidden rounded-lg border border-border bg-surface p-7">
        <div className="ambient-glow pointer-events-none absolute inset-x-0 top-0 h-32 opacity-60" />
        <div className="relative flex flex-col items-center text-center">
          <ProfileAvatar name={student.name} size={112} className="ring-2" />
          <h1 className="mt-5 text-xl font-bold tracking-tight text-ink">
            {student.name}
          </h1>
          <p className="tnum mt-1 text-sm text-muted">{student.usn}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-medium">
              <GraduationCap className="h-3.5 w-3.5" />
              Section {student.section}
            </span>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">
              CSE · Odd Sem
            </span>
          </div>
        </div>
      </section>

      {/* Attendance summary */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Attendance summary
        </h2>
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-5 py-4">
          <div>
            <p className="tnum text-3xl font-bold text-ink" style={{ color: theme.hex }}>
              {formatPct(overall.percentage)}
            </p>
            <p className="tnum mt-0.5 text-xs text-muted">
              {overall.attended} / {overall.conducted} classes
            </p>
          </div>
          <div className="text-right">
            <StatusBadge status={overall.displayStatus} />
            <p className="tnum mt-2 text-xs text-muted">
              {subjects.length} subjects
            </p>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Preferences
        </h2>
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-5 py-4">
          <div>
            <p className="text-sm font-medium text-ink">Appearance</p>
            <p className="text-xs text-muted">Follows your system by default</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <Button
        variant="secondary"
        className="w-full"
        onClick={logout}
        data-testid="logout-button"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
