# Charlas de Seguridad — Plataforma de Procesamiento con IA

Plataforma web para procesar charlas de seguridad en PDF con IA (Hermes), extraer datos estructurados, revisar y generar Excel.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **IA:** Hermes con endpoint configurable
- **OCR:** Tesseract.js
- **PDF:** pdf-parse
- **Excel:** ExcelJS

## Estructura del proyecto

```
charlas-seguridad/
├── docs/
│   └── ARQUITECTURA.md          # Documento de arquitectura (~70 KB)
├── supabase/
│   ├── schema.sql               # Esquema SQL + RLS + seed
│   └── functions/
│       ├── process-pdf/         # Edge Function: procesa PDF con Hermes
│       ├── generate-excel/      # Edge Function: genera Excel
│       ├── health/              # Health check
│       └── _shared/             # Helpers compartidos
├── src/
│   ├── app/                     # Páginas (App Router)
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Landing
│   │   ├── login/
│   │   └── dashboard/
│   │       ├── page.tsx         # Lista de trabajos
│   │       └── jobs/[id]/
│   │           ├── page.tsx     # Detalle del job
│   │           └── review/page.tsx  # Revisión + visor PDF
│   ├── components/              # Componentes UI
│   │   ├── ui/                  # shadcn/ui primitives
│   │   ├── pdf-uploader.tsx
│   │   ├── pdf-viewer.tsx
│   │   ├── talk-review-table.tsx
│   │   ├── participant-editor.tsx
│   │   ├── validation-alerts.tsx
│   │   └── job-status-badge.tsx
│   ├── lib/
│   │   ├── supabase/            # Clientes Supabase
│   │   ├── hermes/              # Cliente + prompt de Hermes
│   │   ├── ocr/                 # OCR Tesseract
│   │   ├── pdf/                 # Extracción de texto
│   │   ├── excel/               # Generador Excel + plantilla
│   │   └── validation/          # Zod + nómina + horarios
│   ├── types/                   # Tipos TypeScript
│   └── middleware.ts            # Protección de rutas
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
├── .env.example
└── README.md
```

## Setup

### 1. Instalar dependencias

```bash
cd charlas-seguridad
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Editar `.env.local` con los valores de tu proyecto Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
HERMES_API_ENDPOINT=https://api.hermes.nousresearch.com/v1/chat/completions
HERMES_API_KEY=tu-api-key
HERMES_MODEL=hermes-1
OCR_LANGUAGE=spa
MAX_PDF_SIZE_MB=10
STORAGE_BUCKET_NAME=charlas-pdf
```

### 3. Aplicar esquema SQL en Supabase

1. Ve a Supabase Dashboard → SQL Editor
2. Pega el contenido de `supabase/schema.sql`
3. Ejecuta

### 4. Configurar Storage

Crear bucket privado en Supabase Dashboard → Storage:
- Nombre: `charlas-pdf` (o el valor de `STORAGE_BUCKET_NAME`)
- Privado: ✓

### 5. Desplegar Edge Functions

```bash
npx supabase functions deploy process-pdf
npx supabase functions deploy generate-excel
npx supabase functions deploy health
```

Configurar secrets de las Edge Functions:

```bash
npx supabase secrets set HERMES_API_ENDPOINT=https://api.hermes.nousresearch.com/v1/chat/completions
npx supabase secrets set HERMES_API_KEY=tu-api-key
npx supabase secrets set HERMES_MODEL=hermes-1
npx supabase secrets set SUPABASE_URL=https://xxx.supabase.co
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
```

### 6. Ejecutar en desarrollo

```bash
npm run dev
```

Abrir http://localhost:3000

### 7. Build de producción

```bash
npm run build
npm start
```

## Flujo de uso

1. Iniciar sesión
2. Crear un nuevo trabajo → subir uno o varios PDFs (drag & drop)
3. El sistema procesa cada PDF: extrae texto o aplica OCR → Hermes → JSON estructurado
4. Revisar los datos extraídos (tabla editable + visor PDF lado a lado)
5. Corregir nombres, horarios, alertas
6. Confirmar → generar Excel
7. Descargar el archivo (pestaña "Datos" completada, plantilla original preservada)

## Reglas del Excel

| Regla | Valor |
|-------|-------|
| División | Compressor Technique Service (CTS) |
| Estado | Completado |
| Descripción | Charla de Seguridad |
| Duración por defecto | 20 minutos |
| Fecha | DD/MM/AAAA |
| Hora | HH:MM |
| Fecha término | = fecha inicio |
| < 1h | Solo "Minutos capacitación" |
| Horas exactas | Solo "Horas capacitación" |
| Mixto | Ambas columnas |
| Sin superposición | Por participante |
| Plantilla | Solo pestaña "Datos" modificada |

## Nómina autorizada (8 personas)

- CACERES MENDOZA, MAURICIO AUGUSTO
- CONTRERAS TORDECILLA, GUILLERMO ENRIQUE
- CORTES CORTES, DIEGO ALBERTO
- FLORES CHAPARRO, SANTIAGO JONATHAN
- MAUREIRA ASTUDILLO, JAVIER ORLANDO
- PEREZ ACUÑA, VILMA ROSSANA
- VILLALOBOS NUÑEZ, DANIEL MAURICIO
- ZAVALA ARAYA, CRISTIAN FELIPE

La comparación tolera: mayúsculas/minúsculas, tildes, errores de OCR, nombres en distinto orden, abreviaciones. Umbral de auto-aprobación: 0.82.

## Seguridad

- ✅ Validación de tipo MIME y tamaño máximo
- ✅ Buckets privados con URLs firmadas
- ✅ Row Level Security en todas las tablas
- ✅ Sanitización de texto del PDF (prevención de prompt injection)
- ✅ Validación estricta del JSON de Hermes con Zod
- ✅ No exponer claves privadas en el frontend
- ✅ No inventar firmas ni confirmar asistencia sin evidencia legible
