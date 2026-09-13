// Tailwind CSS class merge utility
// Simple implementation of clsx + tailwind-merge pattern

type ClassValue = string | number | boolean | undefined | null | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  function process(val: ClassValue): void {
    if (!val) return;
    if (typeof val === 'string') {
      classes.push(val);
    } else if (typeof val === 'number') {
      classes.push(String(val));
    } else if (Array.isArray(val)) {
      for (const item of val) {
        process(item);
      }
    }
  }

  for (const input of inputs) {
    process(input);
  }

  // Deduplicate while preserving order (last occurrence wins for tailwind overrides)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const cls of classes) {
    const key = cls.split(':')[0] || cls; // group by variant prefix for simple override
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cls);
    } else {
      // Replace the previous one
      const idx = result.findIndex((r) => (r.split(':')[0] || r) === key);
      if (idx >= 0) {
        result[idx] = cls;
      } else {
        result.push(cls);
      }
    }
  }

  return result.join(' ');
}
