// =============================================================================
// Validación de horarios - Detectar superposiciones y proponer horarios
// =============================================================================
import { SafetyTalk, ValidationIssue, TalkParticipant } from '../../types';

// -----------------------------------------------------------------------------
// Utilidades de tiempo
// -----------------------------------------------------------------------------

/**
 * Convierte "HH:MM" a minutos desde medianoche.
 */
function timeToMinutes(time: string): number | null {
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, h, m] = match;
  const hours = parseInt(h, 10);
  const mins = parseInt(m, 10);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Convierte minutos desde medianoche a "HH:MM".
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calcula la hora de fin de una charla.
 * Si no hay duración, asume 20 minutos.
 */
function getEndTime(talk: SafetyTalk): number | null {
  const start = timeToMinutes(talk.startTime ?? '');
  if (start === null) return null;
  const duration = talk.durationMinutes ?? talk.duracion_minutos ?? 20;
  return start + duration;
}

/**
 * Normaliza el nombre del participante para comparación (sin tildes, mayúsculas).
 */
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

/**
 * Intervalo de tiempo de una charla para un participante.
 */
interface TimeSlot {
  talkId: string;
  participantName: string;
  start: number;
  end: number;
}

/**
 * Resultado de la validación de horarios.
 */
export interface ScheduleValidationResult {
  /** true si no hay superposiciones */
  valid: boolean;
  /** Problemas detectados */
  issues: ValidationIssue[];
  /** Horarios sugeridos para charlas sin hora */
  suggestions: Array<{
    talkId: string;
    participantName: string;
    suggestedTime: string;
    reason: string;
  }>;
}

// -----------------------------------------------------------------------------
// Detección de superposiciones
// -----------------------------------------------------------------------------

/**
 * Recolecta todos los slots de tiempo por participante.
 */
function collectSlots(talks: SafetyTalk[]): Map<string, TimeSlot[]> {
  const slotsByParticipant = new Map<string, TimeSlot[]>();

  for (const talk of talks) {
    if (!talk.startTime) continue; // Sin hora, no podemos comparar

    const start = timeToMinutes(talk.startTime);
    if (start === null) continue;

    const end = getEndTime(talk);
    if (end === null) continue;

    for (const tp of talk.participants ?? []) {
      const name = normalizeName(tp.participant?.fullName ?? tp.detected_name ?? '');

      const slot: TimeSlot = {
        talkId: talk.id,
        participantName: name,
        start,
        end,
      };

      const existing = slotsByParticipant.get(name);
      if (existing) {
        existing.push(slot);
      } else {
        slotsByParticipant.set(name, [slot]);
      }
    }
  }

  return slotsByParticipant;
}

/**
 * Detecta si dos slots se superponen.
 */
function overlaps(a: TimeSlot, b: TimeSlot): boolean {
  // Una charla no puede comenzar mientras otra del mismo participante
  // siga en curso. El inicio de una debe ser >= el fin de la otra.
  return a.start < b.end && b.start < a.end;
}

// -----------------------------------------------------------------------------
// Propuesta de horarios disponibles
// -----------------------------------------------------------------------------

/**
 * Encuentra el primer horario disponible para un participante,
 * considerando sus slots ya asignados.
 *
 * @param existingSlots - Slots ya ocupados del participante.
 * @param durationMinutes - Duración de la charla en minutos.
 * @param earliestStart - Hora más temprana permitida en minutos (default 08:00).
 * @param latestEnd - Hora más tardía permitida en minutos (default 18:00).
 * @returns Hora de inicio sugerida en formato HH:MM, o null si no hay espacio.
 */
export function findAvailableSlot(
  existingSlots: TimeSlot[],
  durationMinutes: number = 20,
  earliestStart: number = 8 * 60,
  latestEnd: number = 18 * 60,
): string | null {
  if (existingSlots.length === 0) {
    return minutesToTime(earliestStart);
  }

  // Ordenar slots por inicio
  const sorted = [...existingSlots].sort((a, b) => a.start - b.start);

  // Intentar antes del primer slot
  if (sorted[0].start - earliestStart >= durationMinutes) {
    return minutesToTime(earliestStart);
  }

  // Intentar entre slots consecutivos
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].end;
    const gapEnd = sorted[i + 1].start;
    if (gapEnd - gapStart >= durationMinutes) {
      return minutesToTime(gapStart);
    }
  }

  // Intentar después del último slot
  const lastEnd = sorted[sorted.length - 1].end;
  if (lastEnd + durationMinutes <= latestEnd) {
    return minutesToTime(lastEnd);
  }

  return null; // No hay espacio
}

// -----------------------------------------------------------------------------
// Validación principal
// -----------------------------------------------------------------------------

/**
 * Valida los horarios de todas las charlas para detectar superposiciones.
 *
 * Reglas:
 * - Ninguna charla puede comenzar mientras otra del mismo participante siga en curso.
 * - Si una charla no tiene hora, se propone un horario disponible.
 *
 * @param talks - Lista de charlas a validar.
 * @returns Resultado con issues y sugerencias.
 */
export function validateSchedule(
  talks: SafetyTalk[],
): ScheduleValidationResult {
  const issues: ValidationIssue[] = [];
  const suggestions: Array<{
    talkId: string;
    participantName: string;
    suggestedTime: string;
    reason: string;
  }> = [];

  const slotsByParticipant = collectSlots(talks);

  // --- Detectar superposiciones ---
  for (const [name, slots] of slotsByParticipant) {
    // Ordenar por inicio
    const sorted = [...slots].sort((a, b) => a.start - b.start);

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (overlaps(sorted[i], sorted[j])) {
          issues.push({
            id: `overlap-${name}-${sorted[i].talkId}-${sorted[j].talkId}`,
            type: 'time',
            severity: 'critical',
            message: `Superposición detectada para ${name}: ` +
              `charla ${sorted[i].talkId} (${minutesToTime(sorted[i].start)}-${minutesToTime(sorted[i].end)}) ` +
              `se solapa con charla ${sorted[j].talkId} (${minutesToTime(sorted[j].start)}-${minutesToTime(sorted[j].end)})`,
            talkId: sorted[j].talkId,
            participantName: name,
            suggestion: `Ajustar el horario de una de las charlas para evitar superposición.`,
          });
        }
      }
    }
  }

  // --- Proponer horarios para charlas sin hora ---
  for (const talk of talks) {
    if (!talk.startTime) {
      // Recopilar slots existentes de los participantes de esta charla
      for (const tp of talk.participants ?? []) {
        const name = normalizeName(tp.participant?.fullName ?? tp.detected_name ?? '');
        const existingSlots = slotsByParticipant.get(name) ?? [];
        const duration = talk.durationMinutes ?? 20;

        const suggested = findAvailableSlot(existingSlots, duration);

        if (suggested) {
          suggestions.push({
            talkId: talk.id,
            participantName: name,
            suggestedTime: suggested,
            reason: `Charla ${talk.id} no tiene hora asignada. ` +
              `Horario disponible propuesto: ${suggested}.`,
          });
        } else {
          issues.push({
            id: `no-slot-${talk.id}-${name}`,
            type: 'time',
            severity: 'warning',
            message: `No se encontró horario disponible para ${name} ` +
              `en la charla ${talk.id} dentro del rango laboral (08:00-18:00).`,
            talkId: talk.id,
            participantName: name,
            suggestion: `Revisar manualmente el horario o ampliar el rango de trabajo.`,
          });
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    suggestions,
  };
}
