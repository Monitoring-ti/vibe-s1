"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────
interface DashboardTopbarProps {
  userEmail: string;
  userName: string;
}

export function DashboardTopbar({ userEmail, userName }: DashboardTopbarProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-outline-variant bg-surface-container-lowest/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      {/* Left: search */}
      <div className="flex flex-1 items-center gap-3">
        <div className="relative hidden max-w-md flex-1 sm:block">
          <span className="ms pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            placeholder="Buscar charlas, lotes, RUT…"
            className="w-full rounded-full border border-outline-variant bg-surface-container-low py-2 pl-10 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Right: actions + user */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Notifications */}
        <button className="relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high">
          <span className="ms text-xl">notifications</span>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-tertiary" />
        </button>

        {/* Divider */}
        <div className="hidden h-6 w-px bg-outline-variant sm:block" />

        {/* User */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-vibe-gradient text-sm font-semibold text-on-primary">
            {initials}
          </div>
          <div className="hidden flex-col sm:flex">
            <span className="font-label-md text-on-surface leading-tight">
              {userName}
            </span>
            <span className="font-label-sm text-on-surface-variant">
              {userEmail}
            </span>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
          title="Cerrar sesión"
        >
          <span className="ms text-xl">logout</span>
        </button>
      </div>
    </header>
  );
}
