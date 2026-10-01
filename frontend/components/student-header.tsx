"use client";

import Link from "next/link";
import { ProfileAvatar } from "./profile-avatar";
import { ThemeToggle } from "./theme-toggle";
import type { StudentIdentity } from "@/lib/types";

export function StudentHeader({ student }: { student: StudentIdentity }) {
  return (
    <header className="flex items-center justify-between" data-testid="student-header">
      <Link href="/profile" className="flex items-center gap-3 group">
        <ProfileAvatar name={student.name} size={48} />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-ink group-hover:text-royal transition-colors">
            {student.name}
          </p>
          <p className="tnum text-xs text-muted">
            {student.section} · {student.usn}
          </p>
        </div>
      </Link>
      <ThemeToggle />
    </header>
  );
}
