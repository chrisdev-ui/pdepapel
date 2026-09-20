import { describe, expect, it } from "vitest";

import { FOOTER_ITEMS, NAV_GROUPS, footerItemsFor, navGroupsFor } from "@/lib/admin-navigation";

/**
 * El menú no enseña puertas cerradas: «Invitaciones» solo aparece para quien
 * está en `ADMIN_ALLOWED_USER_IDS`. Con la lista vacía (el estado de hoy) la
 * dueña ve exactamente el menú de siempre.
 */
/** «Ajustes» vive en el pie de la barra, así que el menú son los dos. */
const childLabels = (allowed: boolean) => [
  ...navGroupsFor(allowed).flatMap((group) => group.items.flatMap((item) => (item.children ?? []).map((child) => child.label))),
  ...footerItemsFor(allowed).flatMap((item) => (item.children ?? []).map((child) => child.label)),
];
const allChildLabels = () => [
  ...NAV_GROUPS.flatMap((group) => group.items.flatMap((item) => (item.children ?? []).map((child) => child.label))),
  ...FOOTER_ITEMS.flatMap((item) => (item.children ?? []).map((child) => child.label)),
];

describe("menú según la autorización explícita", () => {
  it("esconde las entradas reservadas a quien no está en la lista", () => {
    const labels = childLabels(false);
    expect(labels).not.toContain("Invitaciones");
    expect(labels).toContain("Tienda");
  });

  it("las muestra a quien sí está", () => {
    expect(childLabels(true)).toContain("Invitaciones");
  });

  it("no cambia ninguna otra entrada del menú", () => {
    const withoutInvitations = allChildLabels().filter((label) => label !== "Invitaciones");
    expect(childLabels(false)).toEqual(withoutInvitations);
    expect(navGroupsFor(false).map((group) => group.id)).toEqual(NAV_GROUPS.map((group) => group.id));
    expect(navGroupsFor(false).flatMap((group) => group.items.map((item) => item.id))).toEqual(
      NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id)),
    );
  });
});
