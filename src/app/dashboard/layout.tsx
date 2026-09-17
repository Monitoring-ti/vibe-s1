import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard-topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protección a nivel de layout (además del middleware)
  // BYPASS LOCAL: en desarrollo sin sesión, permitir acceso (probar flujo)
  const isDev = process.env.NODE_ENV === "development";
  if (!user && !isDev) {
    redirect("/login");
  }

  const userEmail = user?.email ?? "dev@local";
  const userName =
    user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Invitado";

  return (
    <div className="flex min-h-screen bg-surface-container-low">
      {/* Sidebar fijo de 256px */}
      <DashboardSidebar />

      {/* Contenido principal */}
      <div className="flex flex-1 flex-col lg:ml-64">
        {/* Top header bar */}
        <DashboardTopbar userEmail={userEmail} userName={userName} />

        {/* Contenido de la página */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}