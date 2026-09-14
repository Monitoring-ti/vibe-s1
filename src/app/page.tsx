import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-gradient px-6">
      {/* Logo */}
      <div className="mb-8">
        <Image
          src="/vibe-logo.png"
          alt="VIBE Safety AI"
          width={220}
          height={143}
          priority
          className="drop-shadow-sm"
        />
      </div>

      {/* Título y descripción breve */}
      <h1 className="mb-4 max-w-2xl text-center text-display-md font-bold text-on-surface">
        Charlas de seguridad, procesadas con IA
      </h1>
      <p className="mb-10 max-w-xl text-center text-body-lg text-on-surface-variant">
        Sube tus actas en PDF, revisa los datos extraídos y descarga el Excel listo.
      </p>

      {/* CTA directo al dashboard */}
      <Link href="/dashboard" className="btn-filled text-body-md">
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
          rocket_launch
        </span>
        Comenzar
      </Link>

      {/* 3 pasos simples */}
      <div className="mt-20 grid w-full max-w-3xl gap-6 sm:grid-cols-3">
        {[
          { num: "1", title: "Sube", desc: "Arrastra tus PDFs de charlas." },
          { num: "2", title: "Revisa", desc: "Corrige lo que la IA detectó." },
          { num: "3", title: "Descarga", desc: "Obtén tu Excel completado." },
        ].map((step) => (
          <div key={step.num} className="m3-card text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-hero-gradient text-white">
              <span className="font-heading text-base font-bold">{step.num}</span>
            </div>
            <h3 className="font-heading text-title-md font-semibold text-on-surface">{step.title}</h3>
            <p className="mt-1 text-body-sm text-on-surface-variant">{step.desc}</p>
          </div>
        ))}
      </div>

      <p className="mt-16 text-label-md text-on-surface-variant">
        Compressor Technique Service · Seguridad Ocupacional HSE
      </p>
    </div>
  );
}
