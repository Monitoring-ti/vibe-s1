/**
 * Cliente servidor para el modelo de visión (inference API de Nous).
 * Recibe páginas renderizadas (base64) y devuelve JSON estructurado.
 */
import type { VisionExtractionResult } from "@/types";

const ENDPOINT = process.env.HERMES_API_ENDPOINT || "https://inference-api.nousresearch.com/v1/chat/completions";
const API_KEY = process.env.HERMES_API_KEY || "";
const MODEL = process.env.HERMES_MODEL || "z-ai/glm-5.3-flash";

const EXTRACTION_PROMPT = `Eres un extractor de datos de actas de charlas de seguridad ocupacionales chilenas.
Analiza las imágenes del documento (son las páginas de un acta) y devuelve SOLO un JSON válido, sin markdown, con esta estructura exacta:

{
  "documento": {
    "archivo": "",
    "estado_extraccion": "ok | parcial | ilegible",
    "observaciones": []
  },
  "charlas": [
    {
      "nombre_curso": "",
      "descripcion": "Charla de Seguridad",
      "fecha_inicio": "DD/MM/AAAA o null",
      "hora_inicio": "HH:MM o null",
      "duracion_minutos": 20,
      "hora_finalizacion": "HH:MM o null",
      "tipo_entrenamiento": "",
      "modalidad": "",
      "idioma": "",
      "creado_por": "",
      "comentarios": "",
      "participantes": [
        {
          "nombre_detectado": "",
          "firma_detectada": false,
          "confianza_nombre": 0.0,
          "confianza_firma": 0.0,
          "pagina_evidencia": 1,
          "requiere_revision": false
        }
      ],
      "confianza_general": 0.0,
      "requiere_revision": false
    }
  ]
}

Reglas:
1. duracion_minutos: si el documento no indica duración, usa 20.
2. hora_finalizacion: calcúlala desde hora_inicio + duracion_minutos si es posible; si no, null.
3. firma_detectada: true SOLO si ves una rúbrica o trazo manuscrito; una línea en blanco NO es firma.
4. confianza_nombre / confianza_firma / confianza_general: número entre 0 y 1.
5. No inventes datos: si un campo no es legible, usa null y baja la confianza.
6. Si hay varias charlas en el documento, inclúyelas todas.
7. Los participantes son las personas listadas en el acta.`;

interface PageInput {
  pageNumber: number;
  base64: string;
}

export async function extractWithVision(
  pages: PageInput[],
  fileName: string,
): Promise<VisionExtractionResult> {
  if (!API_KEY) {
    throw new Error("HERMES_API_KEY no está configurada");
  }

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${EXTRACTION_PROMPT}\n\nNombre del archivo: ${fileName}. Las imágenes corresponden a las páginas ${pages.map((p) => p.pageNumber).join(", ")}.`,
    },
  ];

  for (const page of pages) {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${page.base64}`, detail: "high" },
    });
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content }],
      max_tokens: 4000,
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error del modelo de visión ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const contentStr: string | null = data.choices?.[0]?.message?.content;

  if (!contentStr) {
    throw new Error("El modelo no devolvió contenido");
  }

  // Extraer JSON (tolera markdown fences si el modelo las agrega)
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentStr);
  } catch {
    const match = contentStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      parsed = JSON.parse(match[1]);
    } else {
      throw new Error("La respuesta del modelo no es JSON válido");
    }
  }

  return parsed as VisionExtractionResult;
}
