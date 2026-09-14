"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

// ──────────────────────────────────────────────
// Nav items
// ──────────────────────────────────────────────
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/resultados", label: "Resultados de Sesión", icon: "monitoring", badge: "activo" },
  { href: "/dashboard/visor", label: "Visor Split PDF/IA", icon: "splitscreen" },
  { href: "/dashboard/revision", label: "Revisión Masiva", icon: "fact_check" },
  { href: "/dashboard/exportacion", label: "Exportación XLSX", icon: "table_view" },
];

const FOOTER_ITEMS = [
  { href: "/dashboard/ajustes", label: "Ajustes", icon: "settings" },
  { href: "/dashboard/soporte", label: "Soporte", icon: "support" },
];

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────
export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-outline-variant bg-surface-container-lowest">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <Image
          src="/vibe-icon.png"
          alt=""
          width={40}
          height={40}
          className="rounded-lg"
        />
        <div className="flex flex-col">
          <span className="font-headline-sm text-on-surface leading-tight">
            VIBE Safety AI
          </span>
          <span className="font-label-sm text-on-surface-variant">
            Motor OCR &amp; Biometría
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="ms text-xl">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="rounded-full bg-tertiary-container px-2 py-0.5 font-label-sm text-on-tertiary-container">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* CTA Button */}
      <div className="px-4 pb-4">
        <Link
          href="/dashboard"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-vibe-gradient px-4 py-3 font-label-lg text-on-primary shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02]"
        >
          <span className="ms text-xl">bolt</span>
          Analizar Actas
        </Link>
      </div>

      {/* Footer */}
      <div className="border-t border-outline-variant px-3 py-3">
        {FOOTER_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <span className="ms text-xl">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* AI Engine status */}
        <div className="mt-3 rounded-xl bg-surface-container px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-secondary" />
            </span>
            <span className="font-label-md text-on-surface-variant">
              Motor IA en línea
            </span>
          </div>
          <p className="mt-1 font-label-sm text-on-surface-variant opacity-70">
            Latencia 0.8s · Cola 0
          </p>
        </div>
      </div>
    </aside>
  );
}
