/**
 * Excel template column definitions for the "Datos" sheet.
 *
 * The Excel must be generated from an existing template file, filling ONLY
 * the "Datos" sheet. The "Instrucciones" and "Listas Auxiliares" sheets
 * must remain unchanged.
 */

export interface DatosColumn {
  header: string;
  key: string;
  width: number;
}

/**
 * Columns of the "Datos" sheet, in order.
 * These match the plantilla original.
 */
export const DATOS_COLUMNS: DatosColumn[] = [
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

/** The sheet name that must be filled. */
export const DATOS_SHEET_NAME = "Datos";

/** Sheets that must NOT be modified. */
export const READ_ONLY_SHEETS = ["Instrucciones", "Listas Auxiliares"];

/** Default division for all rows. */
export const DEFAULT_DIVISION = "Compressor Technique Service (CTS)";

/** Default description for all rows. */
export const DEFAULT_DESCRIPCION = "Charla de Seguridad";

/** Default state for all rows. */
export const DEFAULT_ESTADO = "Completado";

/** Default duration (minutes) when not specified. */
export const DEFAULT_DURATION_MINUTES = 20;
