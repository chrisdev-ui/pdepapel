-- Avisos de envío por WhatsApp, plantillas 3 a 5, 2026-10-27 (feat/cierre-pendientes-2026-10-27). Aditiva: tres
-- columnas que admiten NULL. Sin datos.
--   * StoreSettings.whatsappTemplateInTransit / OutForDelivery / Issue: los nombres de las plantillas de utilidad
--     aprobadas en Meta para «en tránsito», «en reparto» y «novedad». Vacío = ese hito sale solo por correo.
--
-- Permisos: `pdepapel_ro` tiene SELECT sobre `railway`.* y lee las columnas nuevas sin otra línea. `copilot_ro` no
-- recibe nada: el Copiloto no necesita nombres de plantillas.
--
-- Se aplica con el flujo guardado (lo corre Christian), ANTES del push de esta rama: el código lee estas columnas.
--   npm run prod:approve -- "Plantillas de avisos 3 a 5 (20261104_add_whatsapp_templates_transit_delivery_issue)"
--   npm run prod:migrate -- prisma/manual-migrations/20261104_add_whatsapp_templates_transit_delivery_issue.sql --expect new
--
-- Verificación (solo lectura): las tres columnas existen, NULL en la fila de la tienda.
--   SELECT whatsappTemplateInTransit, whatsappTemplateOutForDelivery, whatsappTemplateIssue FROM StoreSettings;

ALTER TABLE `StoreSettings`
  ADD COLUMN `whatsappTemplateInTransit` VARCHAR(100) NULL,
  ADD COLUMN `whatsappTemplateOutForDelivery` VARCHAR(100) NULL,
  ADD COLUMN `whatsappTemplateIssue` VARCHAR(100) NULL;
