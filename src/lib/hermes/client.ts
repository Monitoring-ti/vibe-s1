import type { HermesExtractionResult } from "@/types";

/**
 * Hermes AI client for extracting structured data from PDF text.
 * Sends the OCR-extracted text to the Hermes API and receives
 * a structured JSON response with participants and talk metadata.
 */

interface HermesCallParams {
  text: string;
  prompt?: string;
}

interface HermesResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const DEFAULT_ENDPOINT = "https://api.hermes.nousresearch.com/v1/chat/completions";

/**
 * Call the Hermes AI API to extract structured data from text.
 * Uses the configured model and API key from environment variables.
 */
export async function extractWithHermes(
  params: HermesCallParams,
): Promise<HermesExtractionResult> {
  const endpoint = process.env.HERMES_API_ENDPOINT || DEFAULT_ENDPOINT;
  const apiKey = process.env.HERMES_API_KEY;
  const model = process.env.HERMES_MODEL || "z-ai/glm-5.2";

  if (!apiKey) {
    throw new Error("HERMES_API_KEY no está configurada");
  }

  const systemPrompt =
    params.prompt ||
    `Eres un asistente especializado en extraer datos de actas de charlas de seguridad.
Analiza el texto extraído de un PDF y devuelve un JSON con:
- talkTitle: título de la charla
- talkDate: fecha en formato ISO 8601
- talkLocation: lugar (si está disponible)
- instructor: nombre del instructor (si está disponible)
- durationMinutes: duración en minutos (si está disponible)
- participants: array con {fullName, rut, company, role, checkInTime, checkOutTime}

Responde SOLO con el JSON válido, sin texto adicional.`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: params.text },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hermes API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as HermesResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Hermes API no devolvió contenido");
  }

  const parsed = JSON.parse(content) as HermesExtractionResult;
  return parsed;
}
