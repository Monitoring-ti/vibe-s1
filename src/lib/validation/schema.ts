// =============================================================================
// Esquema Zod para validar la respuesta de Hermes
// =============================================================================
import { z } from 'zod';

// -----------------------------------------------------------------------------
// Sub-esquemas
// -----------------------------------------------------------------------------

/**
 * Valida que un string sea una fecha en formato DD/MM/AAAA.
 */
const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
const dateSchema = z
  .string()
  .regex(dateRegex, {
    message: 'La fecha debe estar en formato DD/MM/AAAA (ej: 15/03/2024)',
  })
  .refine((val) => {
    const [, day, month, year] = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)!;
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    if (y < 1900 || y > 2100) return false;
    // Validación básica de días por mes
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (d > daysInMonth[m - 1]) return false;
    return true;
  }, {
    message: 'La fecha no es válida (día/mes/año fuera de rango)',
  });

/**
 * Valida que un string sea una hora en formato HH:MM (24h).
 */
const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
const timeSchema = z
  .string()
  .regex(timeRegex, {
    message: 'La hora debe estar en formato HH:MM de 24 horas (ej: 14:30)',
  })
  .or(z.null());

/**
 * Confianza: número entre 0 y 1.
 */
const confidenceSchema = z
  .number({
    message: 'La confianza debe ser un número',
  })
  .min(0, { message: 'La confianza no puede ser menor que 0' })
  .max(1, { message: 'La confianza no puede ser mayor que 1' });

/**
 * Esquema para un participante individual.
 */
const participantSchema = z.object({
  fullName: z.string({
    required_error: 'El nombre del participante es obligatorio',
    invalid_type_error: 'El nombre del participante debe ser un string',
  }).min(2, {
    message: 'El nombre del participante debe tener al menos 2 caracteres',
  }),
  documentId: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  confidence: confidenceSchema.optional(),
}, {
  message: 'Estructura de participante inválida',
});

/**
 * Esquema para una charla de seguridad.
 */
const talkSchema = z.object({
  topic: z.string({
    required_error: 'El tema de la charla es obligatorio',
    invalid_type_error: 'El tema debe ser un string',
  }).min(1, {
    message: 'El tema de la charla no puede estar vacío',
  }),
  date: z.union([dateSchema, z.null()], {
    message: 'La fecha debe estar en formato DD/MM/AAAA o ser null',
  }),
  startTime: timeSchema,
  durationMinutes: z
    .number({
      invalid_type_error: 'La duración debe ser un número de minutos',
    })
    .int({ message: 'La duración debe ser un número entero de minutos' })
    .positive({ message: 'La duración debe ser positiva' })
    .max(600, { message: 'La duración no puede exceder 600 minutos (10h)' })
    .nullable()
    .optional(),
  location: z.string().nullable().optional(),
  instructor: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  participants: z.array(participantSchema, {
    required_error: 'La lista de participantes es obligatoria (use [] si no hay)',
    invalid_type_error: 'Los participantes deben ser un array',
  }),
}, {
  message: 'Estructura de charla inválida',
});

/**
 * Esquema raíz: la respuesta completa de Hermes.
 */
export const hermesResponseSchema = z.object({
  talks: z.array(talkSchema, {
    required_error: 'El campo "talks" es obligatorio',
    invalid_type_error: '"talks" debe ser un array de charlas',
  }),
}, {
  required_error: 'La respuesta debe ser un objeto con campo "talks"',
  invalid_type_error: 'La respuesta debe ser un objeto JSON',
});

// -----------------------------------------------------------------------------
// Tipos derivados
// -----------------------------------------------------------------------------

export type HermesParsedTalk = z.infer<typeof talkSchema>;
export type HermesParsedParticipant = z.infer<typeof participantSchema>;
export type HermesParsedResponse = z.infer<typeof hermesResponseSchema>;

// -----------------------------------------------------------------------------
// Función de validación
// -----------------------------------------------------------------------------

/**
 * Resultado de la validación.
 */
export interface ValidationResult {
  success: boolean;
  data?: HermesParsedResponse;
  errors: Array<{
    path: string;
    message: string;
    code: string;
  }>;
}

/**
 * Valida la respuesta de Hermes contra el esquema Zod.
 *
 * @param parsed - El JSON parseado de la respuesta de Hermes.
 * @returns Resultado con data (si éxito) o errors (si falla).
 */
export function validateHermesResponse(parsed: unknown): ValidationResult {
  const result = hermesResponseSchema.safeParse(parsed);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      errors: [],
    };
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

  return {
    success: false,
    errors,
  };
}
