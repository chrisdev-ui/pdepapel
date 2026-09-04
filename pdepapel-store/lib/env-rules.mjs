/**
 * Marks a variable as mandatory only for Vercel Production builds.
 *
 * Vercel sets VERCEL_ENV to "production" while building and serving the
 * production deployment. Local builds, CI, and Preview deployments keep the
 * variable optional, so they never need production analytics identifiers.
 *
 * Why: on 2026-08-31 the analytics variables were deleted from the Vercel
 * projects and the next production build succeeded silently, leaving GA4 and
 * Clarity dark for four days. Failing the build keeps the last good
 * deployment live instead.
 */
/** @param {Record<string, string | undefined>} [environment] */
export function isVercelProductionBuild(environment = process.env) {
  return environment.VERCEL_ENV === "production";
}

/**
 * @template {import("zod").ZodTypeAny} T
 * @param {T} schema
 * @param {Record<string, string | undefined>} [environment]
 * @returns {T | import("zod").ZodOptional<T>}
 */
export function requiredInProduction(schema, environment = process.env) {
  return isVercelProductionBuild(environment) ? schema : schema.optional();
}
