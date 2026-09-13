/**
 * System prompt for Hermes AI to extract structured data from
 * safety talk (charla de seguridad) attendance PDFs.
 */
export const EXTRACTION_SYSTEM_PROMPT = `Eres un experto en procesamiento de actas de charlas de seguridad ocupacional en Chile.

Tu tarea es analizar el texto extraído de un PDF (que puede venir de OCR) y devolver un objeto JSON con la siguiente estructura:

{
  "talkTitle": string,
  "talkDate": string (ISO 8601, ej: "2024-01-15T08:00:00"),
  "talkLocation": string (opcional),
  "instructor": string (opcional),
  "durationMinutes": number (opcional),
  "participants": [
    {
      "fullName": string,
      "rut": string (formato 12345678-9, opcional),
      "company": string (empresa o contratista, opcional),
      "role": string (cargo, opcional),
      "checkInTime": string (ISO 8601, opcional),
      "checkOutTime": string (ISO 8601, opcional)
    }
  ],
  "rawText": string (el texto limpio original, opcional)
}

Reglas importantes:
1. Devuelve SOLO el JSON válido, sin markdown, sin explicaciones.
2. Si un campo no está presente en el texto, omítelo o usa null.
3. Normaliza los RUT al formato 12345678-9 (sin puntos).
4. Los nombres deben estar en el formato "Apellido, Nombre" o "Nombre Apellido" según aparezcan.
5. Si hay múltiples páginas, consolida los participantes en una sola lista.
6. Si el texto proviene de OCR y tiene errores, intenta corregir nombres obvios.
7. La fecha debe estar en zona horaria de America/Santiago (UTC-4 o UTC-3 según horario de verano).`;

/**
 * Prompt for asking about a specific participant's validity.
 */
export const VALIDATION_PROMPT = `Analiza la siguiente información de un participante en una charla de seguridad e identifica posibles problemas:

1. ¿El RUT tiene formato válido? (módulo 11)
2. ¿El nombre parece completo (al menos nombre y apellido)?
3. ¿Los horarios de check-in/check-out son coherentes?
4. ¿Hay duplicados o inconsistencias?

Devuelve un JSON con:
{
  "valid": boolean,
  "issues": string[],
  "suggestions": string[]
}`;
