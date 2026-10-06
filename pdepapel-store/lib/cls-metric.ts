/**
 * CLS de una vista de página, calculado como Chrome y web-vitals: la peor
 * «ventana de sesión» (desplazamientos separados por menos de 1 s, ventana de
 * 5 s como máximo), sin contar los que siguen a una interacción. Además guarda
 * el elemento que más se movió en el mayor desplazamiento, como selector CSS
 * (etiqueta, id y clases; nunca texto ni atributos con datos).
 */

export type LayoutShiftSource = {
  node?: Node | null;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
};

export type LayoutShiftEntry = {
  startTime: number;
  value: number;
  hadRecentInput: boolean;
  sources?: readonly LayoutShiftSource[];
};

export type ClsSnapshot = {
  value: number;
  largestValue: number;
  largestTarget: string;
};

const MAX_SELECTOR_LENGTH = 100;
const MAX_LEVELS = 5;
const MAX_CLASSES = 2;

/** Quita lo que Tailwind mete en clases arbitrarias (`[`, `]`, `:`, `/`…). */
const cleanToken = (token: string) => token.replace(/[^a-zA-Z0-9_-]/g, "");

function describeOne(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${cleanToken(element.id)}` : "";
  const classes = Array.from(element.classList)
    .map(cleanToken)
    .filter((name) => name && !/^\d/.test(name))
    .slice(0, MAX_CLASSES)
    .map((name) => `.${name}`)
    .join("");
  return `${tag}${id}${classes}`;
}

/** Selector corto del elemento: hasta 5 niveles o hasta el primer id. */
export function describeElement(node: Node | null | undefined): string {
  if (!node || node.nodeType !== 1) return "";
  const parts: string[] = [];
  let element: Element | null = node as Element;
  while (element && parts.length < MAX_LEVELS && element.tagName !== "BODY" && element.tagName !== "HTML") {
    parts.unshift(describeOne(element));
    if (element.id) break;
    element = element.parentElement;
  }
  const selector = parts.join(">");
  return selector.length > MAX_SELECTOR_LENGTH ? selector.slice(selector.length - MAX_SELECTOR_LENGTH) : selector;
}

const area = (rect: DOMRectReadOnly) => Math.max(0, rect.width) * Math.max(0, rect.height);

/** La fuente más grande del desplazamiento, como hace web-vitals. */
function largestSource(entry: LayoutShiftEntry): Node | null {
  let best: LayoutShiftSource | null = null;
  for (const source of entry.sources ?? []) {
    if (!source.node) continue;
    if (!best || area(source.previousRect) + area(source.currentRect) > area(best.previousRect) + area(best.currentRect)) best = source;
  }
  return best?.node ?? null;
}

export function createClsTracker() {
  let value = 0;
  let windowValue = 0;
  let windowStart = 0;
  let lastTime = Number.NEGATIVE_INFINITY;
  let largestValue = 0;
  let largestTarget = "";

  return {
    add(entry: LayoutShiftEntry) {
      if (entry.hadRecentInput) return;
      if (entry.startTime - lastTime > 1000 || entry.startTime - windowStart > 5000) {
        windowValue = 0;
        windowStart = entry.startTime;
      }
      windowValue += entry.value;
      lastTime = entry.startTime;
      value = Math.max(value, windowValue);
      if (entry.value > largestValue) {
        largestValue = entry.value;
        largestTarget = describeElement(largestSource(entry));
      }
    },
    snapshot(): ClsSnapshot {
      return { value, largestValue, largestTarget };
    },
    reset() {
      value = 0;
      windowValue = 0;
      windowStart = 0;
      lastTime = Number.NEGATIVE_INFINITY;
      largestValue = 0;
      largestTarget = "";
    },
  };
}
