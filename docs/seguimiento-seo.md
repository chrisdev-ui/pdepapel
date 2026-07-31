# Seguimiento SEO posterior a la migración de URLs

## Durante las primeras cuatro semanas

1. Revisa el informe de sitemaps de Google Search Console y confirma que `https://papeleriapdepapel.com/sitemap.xml` no tenga errores de lectura.
2. En el informe de indexación, valida que las URLs antiguas aparezcan como redirigidas y que las rutas en español se indexen como canónicas. Las páginas de productos archivados deben aparecer excluidas por `noindex`.
3. Usa Inspección de URL para la página principal, una categoría y un producto. Solicita indexación únicamente si la versión publicada no ha sido detectada después de varios días.
4. Revisa Rendimiento por consulta y página, comparando clics, impresiones, CTR y posición de las categorías nuevas con el periodo anterior a la migración.
5. Revisa Core Web Vitals por móvil y escritorio. Las métricas de campo tardan en actualizarse, por lo que cada corrección debe monitorearse durante el periodo de validación de Google.

## Alertas y controles automáticos

- GitHub Actions ejecuta comprobaciones de tipos y formato en cada cambio a `main` o pull request.
- Al completarse un despliegue de producción y cada lunes, las pruebas públicas comprueban `robots.txt`, el sitemap, las redirecciones, una categoría y un producto archivado.
- Si la revalidación de la tienda en línea falla, administración envía un correo a los responsables como máximo una vez por hora.
- Revisa las notificaciones de GitHub Actions y los correos de alerta; ambos requieren que sus secretos actuales sigan configurados a nivel del repositorio.

## Ejecución local de las pruebas públicas

```bash
cd pdepapel-store
npx playwright install chromium
npm run test:e2e
```

Por defecto, las pruebas consultan producción. Para validar otro entorno, define `E2E_BASE_URL`. Si cambia la categoría o producto archivado de referencia, actualiza `E2E_CATEGORY_SLUG` o `E2E_ARCHIVED_PRODUCT_SLUG`.
