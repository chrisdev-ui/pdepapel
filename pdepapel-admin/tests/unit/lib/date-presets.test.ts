import { getDatePresets } from "@/lib/date-presets";
import { format } from "date-fns";
import { describe, expect, it } from "vitest";

const dateFormat = "yyyy-MM-dd HH:mm";

describe("getDatePresets", () => {
  it("uses one reference date and returns the Colombian Monday-to-Sunday week", () => {
    const presets = getDatePresets(new Date(2026, 6, 31, 12));
    const currentWeek = presets.find((preset) => preset.name === "Esta semana");
    const nextWeek = presets.find(
      (preset) => preset.name === "La próxima semana",
    );

    expect(currentWeek).toMatchObject({ name: "Esta semana" });
    expect(format(currentWeek!.from, dateFormat)).toBe("2026-07-27 00:00");
    expect(format(currentWeek!.to, dateFormat)).toBe("2026-08-02 23:59");
    expect(format(nextWeek!.from, dateFormat)).toBe("2026-08-03 00:00");
    expect(format(nextWeek!.to, dateFormat)).toBe("2026-08-09 23:59");
  });

  it("keeps Sunday inside the week that starts on the preceding Monday", () => {
    const presets = getDatePresets(new Date(2026, 7, 2, 16));
    const currentWeek = presets.find((preset) => preset.name === "Esta semana");

    expect(format(currentWeek!.from, dateFormat)).toBe("2026-07-27 00:00");
    expect(format(currentWeek!.to, dateFormat)).toBe("2026-08-02 23:59");
  });

  it("creates a new range for every invocation", () => {
    const firstPresets = getDatePresets(new Date(2026, 6, 31, 12));
    const secondPresets = getDatePresets(new Date(2026, 7, 3, 12));

    expect(firstPresets[0].from).not.toEqual(secondPresets[0].from);
    expect(format(secondPresets[0].from, "yyyy-MM-dd")).toBe("2026-08-03");
  });
});
