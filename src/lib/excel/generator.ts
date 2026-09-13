/**
 * Excel generator using ExcelJS.
 *
 * Reads an existing template file (.xlsx), fills ONLY the "Datos" sheet
 * with one row per worker per talk, and leaves "Instrucciones" and
 * "Listas Auxiliares" untouched.
 */

import ExcelJS from "exceljs";
import type { SafetyTalk, TalkParticipant } from "@/types";
import {
  DATOS_SHEET_NAME,
  READ_ONLY_SHEETS,
  DEFAULT_DIVISION,
  DEFAULT_DESCRIPCION,
  DEFAULT_ESTADO,
  DEFAULT_DURATION_MINUTES,
} from "./template";

/**
 * Formats a Date as DD/MM/YYYY.
 */
function formatDateDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Formats a Date as HH:MM.
 */
function formatTimeHHMM(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Parses a time string (HH:MM or HH:MM:SS) into hours and minutes.
 */
function parseTimeString(time: string): { hours: number; minutes: number } {
  const parts = time.split(":").map(Number);
  return {
    hours: parts[0] || 0,
    minutes: parts[1] || 0,
  };
}

/**
 * Parses a date string (DD/MM/YYYY or ISO) into a Date.
 */
function parseDateString(dateStr: string): Date | null {
  // Try DD/MM/YYYY
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return new Date(
      Number(ddmmyyyy[3]),
      Number(ddmmyyyy[2]) - 1,
      Number(ddmmyyyy[1]),
    );
  }
  // Try ISO
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/**
 * Computes the end time from a start time and duration in minutes.
 */
function computeEndTime(
  startTime: string,
  durationMinutes: number,
): string {
  const { hours, minutes } = parseTimeString(startTime);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60);
  const endMins = totalMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}`;
}

interface ExcelRowData {
  nombre_trabajador: string;
  division: string;
  fecha_inicio: string;
  hora_inicio: string;
  estado: string;
  fecha_termino: string;
  hora_finalizacion: string;
  nombre_curso: string;
  descripcion: string;
  tipo_entrenamiento: string;
  modalidad: string;
  idioma: string;
  minutos_capacitacion: string;
  horas_capacitacion: string;
  creado_por: string;
  comentarios: string;
}

/**
 * Builds row data for one participant in one talk.
 *
 * Rules:
 * - División: CTS
 * - Fecha formato DD/MM/AAAA
 * - Fecha de término = fecha de inicio
 * - Estado: Completado
 * - Descripción: Charla de Seguridad
 * - Si no indica duración: 20 minutos
 * - Si < 1h: solo minutos
 * - Si horas exactas: solo horas
 * - Si mixto: ambas
 */
function buildRow(
  talk: SafetyTalk,
  participant: TalkParticipant,
): ExcelRowData {
  const durationMin = talk.duracion_minutos || DEFAULT_DURATION_MINUTES;
  const fechaInicio = talk.fecha_inicio
    ? formatDateDDMMYYYY(parseDateString(talk.fecha_inicio) || new Date())
    : "";

  const horaInicio = talk.hora_inicio || "";
  const horaFin = horaInicio
    ? computeEndTime(horaInicio, durationMin)
    : talk.hora_finalizacion || "";

  // Duration rules
  let minutosCap = "";
  let horasCap = "";

  if (durationMin < 60) {
    minutosCap = String(durationMin);
  } else if (durationMin % 60 === 0) {
    horasCap = String(durationMin / 60);
  } else {
    horasCap = String(Math.floor(durationMin / 60));
    minutosCap = String(durationMin % 60);
  }

  return {
    nombre_trabajador: (participant.nombre_normalizado || participant.nombre_detectado) ?? '',
    division: DEFAULT_DIVISION,
    fecha_inicio: fechaInicio,
    hora_inicio: horaInicio,
    estado: DEFAULT_ESTADO,
    fecha_termino: fechaInicio, // = fecha de inicio
    hora_finalizacion: horaFin,
    nombre_curso: talk.nombre_curso || "",
    descripcion: talk.descripcion || DEFAULT_DESCRIPCION,
    tipo_entrenamiento: talk.tipo_entrenamiento || "",
    modalidad: talk.modalidad || "",
    idioma: talk.idioma || "",
    minutos_capacitacion: minutosCap,
    horas_capacitacion: horasCap,
    creado_por: talk.creado_por || "",
    comentarios: talk.comentarios || "",
  };
}

/**
 * Generate an Excel file from talks + participants, using a template.
 *
 * @param talks - Array of safety talks with participants
 * @param templatePath - Path to the .xlsx template file
 * @returns Buffer of the generated Excel
 */
export async function generateExcel(
  talks: SafetyTalk[],
  templatePath: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  // Find the "Datos" sheet
  const datosSheet = workbook.getWorksheet(DATOS_SHEET_NAME);
  if (!datosSheet) {
    throw new Error(
      `No se encontró la hoja "${DATOS_SHEET_NAME}" en el archivo de plantilla`,
    );
  }

  // Find the header row (row 1) and determine column mapping
  // We assume headers match the expected column names
  const headerRow = datosSheet.getRow(1);
  const colMap: Record<string, number> = {};

  headerRow.eachCell((cell, colNumber) => {
    const headerText = String(cell.value || "").trim();
    if (headerText) {
      colMap[headerText] = colNumber;
    }
  });

  // If no headers found, use default column positions (1-indexed)
  const useDefaultPositions = Object.keys(colMap).length === 0;

  // Determine the first data row (after header)
  let currentRow = 2; // Assume header is row 1

  // If the sheet already has data, find the last used row
  if (datosSheet.rowCount > 1) {
    // Check if there's existing data we should not overwrite
    // For safety, append after existing data
    currentRow = datosSheet.rowCount + 1;
  }

  // Column keys in order matching the template
  const columnKeys: Array<keyof ExcelRowData> = [
    "nombre_trabajador",
    "division",
    "fecha_inicio",
    "hora_inicio",
    "estado",
    "fecha_termino",
    "hora_finalizacion",
    "nombre_curso",
    "descripcion",
    "tipo_entrenamiento",
    "modalidad",
    "idioma",
    "minutos_capacitacion",
    "horas_capacitacion",
    "creado_por",
    "comentarios",
  ];

  // Column header names (for mapping)
  const headerNames: Record<keyof ExcelRowData, string> = {
    nombre_trabajador: "Nombre trabajador",
    division: "División",
    fecha_inicio: "Fecha de inicio",
    hora_inicio: "Hora inicio",
    estado: "Estado",
    fecha_termino: "Fecha de término",
    hora_finalizacion: "Hora finalización del curso",
    nombre_curso: "Nombre del curso",
    descripcion: "Descripción",
    tipo_entrenamiento: "Tipo de entrenamiento",
    modalidad: "Modalidad de entrenamiento",
    idioma: "Idioma del curso",
    minutos_capacitacion: "Minutos capacitación",
    horas_capacitacion: "Horas capacitación",
    creado_por: "Creado por",
    comentarios: "Comentarios",
  };

  // Generate one row per participant per talk
  for (const talk of talks) {
    if (!talk.participantes || talk.participantes.length === 0) continue;

    for (const participant of talk.participantes) {
      const rowData = buildRow(talk, participant);
      const row = datosSheet.getRow(currentRow);

      for (let i = 0; i < columnKeys.length; i++) {
        const key = columnKeys[i];
        let colNum: number;

        if (useDefaultPositions) {
          colNum = i + 1;
        } else {
          const headerName = headerNames[key];
          colNum = colMap[headerName] || i + 1;
        }

        row.getCell(colNum).value = rowData[key];
      }

      currentRow++;
    }
  }

  // Ensure read-only sheets are not modified (they shouldn't be since we only
  // wrote to "Datos", but let's be explicit)
  for (const sheetName of READ_ONLY_SHEETS) {
    const sheet = workbook.getWorksheet(sheetName);
    if (sheet) {
      // No modifications — just confirming the sheet exists and is untouched
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generate an Excel file from talks (without template) — creates a new workbook.
 * Used as fallback when no template is available.
 */
export async function generateExcelFromScratch(talks: SafetyTalk[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Charlas de Seguridad Platform";
  workbook.created = new Date();

  // --- Sheet: Datos ---
  const datosSheet = workbook.addWorksheet(DATOS_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Set up columns
  const columnDefs: Array<{ header: string; key: string; width: number }> = [
    { header: "Nombre trabajador", key: "nombre_trabajador", width: 35 },
    { header: "División", key: "division", width: 30 },
    { header: "Fecha de inicio", key: "fecha_inicio", width: 14 },
    { header: "Hora inicio", key: "hora_inicio", width: 12 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Fecha de término", key: "fecha_termino", width: 14 },
    { header: "Hora finalización del curso", key: "hora_finalizacion", width: 18 },
    { header: "Nombre del curso", key: "nombre_curso", width: 35 },
    { header: "Descripción", key: "descripcion", width: 25 },
    { header: "Tipo de entrenamiento", key: "tipo_entrenamiento", width: 20 },
    { header: "Modalidad de entrenamiento", key: "modalidad", width: 22 },
    { header: "Idioma del curso", key: "idioma", width: 15 },
    { header: "Minutos capacitación", key: "minutos_capacitacion", width: 16 },
    { header: "Horas capacitación", key: "horas_capacitacion", width: 15 },
    { header: "Creado por", key: "creado_por", width: 25 },
    { header: "Comentarios", key: "comentarios", width: 40 },
  ];

  datosSheet.columns = columnDefs;

  // Style header row
  const headerRow = datosSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2563EB" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  // Add data rows
  for (const talk of talks) {
    if (!talk.participantes || talk.participantes.length === 0) continue;

    for (const participant of talk.participantes) {
      const rowData = buildRow(talk, participant);
      datosSheet.addRow(rowData);
    }
  }

  // --- Sheet: Instrucciones (empty placeholder) ---
  if (!workbook.getWorksheet("Instrucciones")) {
    const instrSheet = workbook.addWorksheet("Instrucciones");
    instrSheet.getCell(1).value = "Instrucciones del formato";
    instrSheet.getCell(1).font = { bold: true };
  }

  // --- Sheet: Listas Auxiliares (empty placeholder) ---
  if (!workbook.getWorksheet("Listas Auxiliares")) {
    const listasSheet = workbook.addWorksheet("Listas Auxiliares");
    listasSheet.getCell(1).value = "Listas Auxiliares";
    listasSheet.getCell(1).font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
