"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, TrendingUp, User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SessionData } from "@/lib/types";
import { AttendanceProvider } from "./attendance-provider";
import { Logo } from "./logo";

const NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/forecast", label: "Forecast", icon: TrendingUp },
  { href: "/profile", label: "Profile", icon: User },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export function AppFrame({
  student,
  children,
}: {
  student: SessionData;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AttendanceProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
          {/* Desktop sidebar */}
          <aside className="hidden lg:flex sticky top-0 h-screen flex-col border-r border-border bg-surface px-5 py-7">
            <Logo className="mb-10" />
            <nav className="flex flex-col gap-1">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    data-testid={`sidebar-nav-${label.toLowerCase()}`}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-royal/10 text-royal"
                        : "text-muted hover:text-ink hover:bg-surface-2"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto rounded-md border border-border bg-surface-2/60 p-3">
              <p className="text-xs font-semibold text-ink truncate">
                {student.name}
              </p>
              <p className="tnum text-xs text-muted">
                {student.section} · {student.usn}
              </p>
            </div>
          </aside>

          {/* Content */}
          <div className="flex min-h-screen flex-col">
            <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-28 pt-6 lg:max-w-3xl lg:px-10 lg:pb-12 lg:pt-10">
              {children}
            </main>
          </div>

          {/* Mobile bottom nav */}
          <nav
            data-testid="mobile-bottom-nav"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/85 backdrop-blur-xl lg:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    data-testid={`nav-${label.toLowerCase()}`}
                    aria-current={active ? "page" : undefined}
                    className="relative flex flex-1 flex-col items-center gap-1 py-2.5"
                  >
                    <span className="relative flex h-9 w-14 items-center justify-center">
                      {active && (
                        <span className="absolute inset-0 rounded-full bg-royal/[0.12] transition-colors" />
                      )}
                      <Icon
                        className={cn(
                          "relative h-[22px] w-[22px] transition-colors",
                          active ? "text-royal" : "text-muted"
                        )}
                        strokeWidth={active ? 2.4 : 2}
                      />
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium transition-colors",
                        active ? "text-royal" : "text-muted"
                      )}
                    >
                      {label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
      </div>
    </AttendanceProvider>
  );
}
