import { describe, expect, it } from "vitest";

import { FOOTER_ITEMS, NAV_GROUPS, footerItemsFor, navGroupsFor } from "@/lib/admin-navigation";

/**
 * El menú no enseña puertas cerradas: «Invitaciones» solo aparece para quien
 * está en `ADMIN_ALLOWED_USER_IDS`. Con la lista vacía (el estado de hoy) la
 * dueña ve exactamente el menú de siempre.
 */
/** «Ajustes» vive en el pie de la barra, así que el menú son los dos. */
const visibility = (allowed: boolean) => ({ canWrite: true, ownerAllowlisted: allowed });
const childLabels = (allowed: boolean) => [
  ...navGroupsFor(visibility(allowed)).flatMap((group) => group.items.flatMap((item) => (item.children ?? []).map((child) => child.label))),
  ...footerItemsFor(visibility(allowed)).flatMap((item) => (item.children ?? []).map((child) => child.label)),
];
/** Pantallas de primer nivel que ve esta sesión. */
const screenIds = (canWrite: boolean) =>
  navGroupsFor({ canWrite, ownerAllowlisted: canWrite }).flatMap((group) => group.items.map((item) => item.id));
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
    // «Sin costo» se esconde por lo mismo que «Invitaciones»: la vista existe
    // solo para encontrar productos sin precio de compra.
    const ownerOnlyChildren = ["Invitaciones", "Sin costo"];
    const withoutInvitations = allChildLabels().filter((label) => !ownerOnlyChildren.includes(label));
    expect(childLabels(false)).toEqual(withoutInvitations);
    expect(navGroupsFor(visibility(false)).map((group) => group.id)).toEqual(NAV_GROUPS.map((group) => group.id));
    expect(navGroupsFor(visibility(false)).flatMap((group) => group.items.map((item) => item.id))).toEqual(
      NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id)),
    );
  });
});

describe("pantallas reservadas a la dueña", () => {
  it("esconde a la cuenta de solo lectura lo que muestra dinero propio, datos personales o solo sirve para escribir", () => {
    const viewer = screenIds(false);
    for (const hidden of [
      "pos",
      "mercadolibre",
      "conversaciones",
      "proveedores",
      "movimientos",
      "aprovisionamiento",
      "boletin",
      "rendimiento",
      "tributarios",
    ]) {
      expect(viewer, hidden).not.toContain(hidden);
    }
    expect(footerItemsFor({ canWrite: false }).map((item) => item.id)).not.toContain("ajustes");
  });

  it("le deja lo que sí puede mirar", () => {
    const viewer = screenIds(false);
    // Inventario, Envíos, Clientes y Preventas entraron en la fase 2: el
    // servidor las sirve depuradas (`lib/viewer-payloads.ts`), así que el menú
    // tiene que decir la verdad y enseñarlas.
    for (const visible of ["inicio", "pedidos", "productos", "atributos", "promociones", "contenido", "ferias", "inventario", "envios", "clientes", "preventas"]) {
      expect(viewer, visible).toContain(visible);
    }
    expect(footerItemsFor({ canWrite: false }).map((item) => item.id)).toContain("manual");
  });

  it("a la dueña no le esconde nada", () => {
    expect(screenIds(true)).toEqual(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id)));
    expect(footerItemsFor({ canWrite: true, ownerAllowlisted: true }).map((item) => item.id)).toEqual(
      FOOTER_ITEMS.map((item) => item.id),
    );
  });
});
