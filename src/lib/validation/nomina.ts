/**
 * Validación de nombres contra la nómina autorizada CTS.
 * Tolerante a: mayúsculas/minúsculas, tildes, errores de OCR, orden distinto.
 * No aprueba coincidencias dudosas automáticamente.
 */

const NOMINA_AUTORIZADA: readonly string[] = [
  "CACERES MENDOZA, MAURICIO AUGUSTO",
  "CONTRERAS TORDECILLA, GUILLERMO ENRIQUE",
  "CORTES CORTES, DIEGO ALBERTO",
  "FLORES CHAPARRO, SANTIAGO JONATHAN",
  "MAUREIRA ASTUDILLO, JAVIER ORLANDO",
  "PEREZ ACUÑA, VILMA ROSSANA",
  "VILLALOBOS NUÑEZ, DANIEL MAURICIO",
  "ZAVALA ARAYA, CRISTIAN FELIPE",
];

const MATCH_THRESHOLD = 0.82; // por debajo = requiere revisión manual

export function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/Ñ/g, "N")
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Compara normalizando también el orden: prueba el nombre tal cual
 * y con apellidos/nombres reordenados (última palabra primera).
 */
export function matchNomina(extractedName: string): {
  normalized: string;
  matchedName: string | null;
  confidence: number;
  approved: boolean;
} {
  const normalized = normalizeName(extractedName);
  if (!normalized) {
    return { normalized: "", matchedName: null, confidence: 0, approved: false };
  }

  // Variante con orden invertido: "PEREZ ACUNA VILMA ROSSANA" -> "VILMA ROSSANA PEREZ ACUNA"
  const words = normalized.split(" ");
  const reordered =
    words.length >= 3
      ? `${words.slice(2).join(" ")} ${words.slice(0, 2).join(" ")}`
      : normalized;

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const nominaName of NOMINA_AUTORIZADA) {
    const target = normalizeName(nominaName);
    const score = Math.max(
      similarity(normalized, target),
      similarity(reordered, target),
    );
    if (score > bestScore) {
      bestScore = score;
      bestMatch = nominaName;
    }
  }

  return {
    normalized,
    matchedName: bestMatch,
    confidence: bestScore,
    approved: bestScore >= MATCH_THRESHOLD,
  };
}

export { NOMINA_AUTORIZADA };
