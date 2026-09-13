"use client";
import Link from "next/link";
import { ShieldCheck, LayoutDashboard, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface DashboardNavProps {
  userEmail: string;
}

export function DashboardNav({ userEmail }: DashboardNavProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-slate-900">Charlas</span>
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-sm text-slate-600">
            <User className="h-3.5 w-3.5" />
            {userEmail}
          </span>
          <Button size="sm" variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Salir
          </Button>
        </div>
      </div>
    </header>
  );
}
