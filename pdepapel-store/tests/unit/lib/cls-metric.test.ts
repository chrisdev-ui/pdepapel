// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createClsTracker, describeElement } from "@/lib/cls-metric";

const rect = (height: number) => ({ x: 0, y: 0, width: 100, height, top: 0, left: 0, right: 100, bottom: height, toJSON: () => ({}) }) as DOMRectReadOnly;
const shift = (startTime: number, value: number, node?: Node, hadRecentInput = false) => ({
  startTime,
  value,
  hadRecentInput,
  sources: node ? [{ node, previousRect: rect(10), currentRect: rect(10) }] : [],
});

describe("createClsTracker", () => {
  it("keeps the worst session window (1 s gap, 5 s max) like Chrome", () => {
    const tracker = createClsTracker();
    tracker.add(shift(100, 0.05));
    tracker.add(shift(600, 0.05)); // misma ventana: 0,10
    tracker.add(shift(3000, 0.08)); // ventana nueva (más de 1 s)
    expect(tracker.snapshot().value).toBeCloseTo(0.1);
    tracker.add(shift(3500, 0.04)); // 0,12
    expect(tracker.snapshot().value).toBeCloseTo(0.12);
  });

  it("caps a window at 5 s even without gaps", () => {
    const tracker = createClsTracker();
    for (let t = 0; t <= 6000; t += 900) tracker.add(shift(t, 0.01));
    expect(tracker.snapshot().value).toBeCloseTo(0.06);
  });

  it("ignores shifts right after an interaction", () => {
    const tracker = createClsTracker();
    tracker.add(shift(100, 0.5, undefined, true));
    expect(tracker.snapshot()).toEqual({ value: 0, largestValue: 0, largestTarget: "" });
  });

  it("records the element of the largest shift and resets for the next view", () => {
    document.body.innerHTML = `<main id="contenido"><section class="hero lg:grid-cols-[minmax(0,1fr)_46%]"><ul class="trust xl:h-5"><li>x</li></ul></section></main>`;
    const tracker = createClsTracker();
    tracker.add(shift(100, 0.02, document.querySelector("li")!));
    tracker.add(shift(200, 0.11, document.querySelector("ul")!));
    expect(tracker.snapshot()).toMatchObject({ largestValue: 0.11, largestTarget: "main#contenido>section.hero.lggrid-cols-minmax01fr_46>ul.trust.xlh-5" });
    tracker.reset();
    expect(tracker.snapshot()).toEqual({ value: 0, largestValue: 0, largestTarget: "" });
  });
});

describe("describeElement", () => {
  it("only uses tag, id and class names, never text or other attributes", () => {
    document.body.innerHTML = `<div data-email="persona@correo.com" title="Juana Pérez"><p class="nombre">Juana Pérez</p></div>`;
    const selector = describeElement(document.querySelector("p"));
    expect(selector).toBe("div>p.nombre");
    expect(selector).not.toMatch(/Juana|correo/);
  });

  it("stops at five levels and at 100 characters", () => {
    document.body.innerHTML = "<div><div><div><div><div><div><span class='a-very-long-class-name-that-keeps-going b-another-long-class-name'></span></div></div></div></div></div></div>";
    const selector = describeElement(document.querySelector("span"));
    expect(selector.split(">").length).toBeLessThanOrEqual(5);
    expect(selector.length).toBeLessThanOrEqual(100);
  });

  it("returns an empty string for text nodes or nothing", () => {
    expect(describeElement(document.createTextNode("hola"))).toBe("");
    expect(describeElement(null)).toBe("");
  });
});
