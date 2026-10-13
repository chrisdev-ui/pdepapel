import Link from "next/link";
import { forwardRef, type ComponentProps } from "react";

import { isAccountGroupPath } from "@/lib/routes";

type StorefrontLinkProps = ComponentProps<typeof Link>;

/**
 * `next/link`, salvo hacia iniciar sesión, crear cuenta o Mi cuenta: ahí un
 * `<a>` normal. Esas páginas cargan Clerk completo y una navegación sin recarga
 * reutilizaría el Clerk sin interfaz de las páginas públicas.
 */
export const StorefrontLink = forwardRef<HTMLAnchorElement, StorefrontLinkProps>(function StorefrontLink(
  { href, prefetch, replace, scroll, shallow, locale, legacyBehavior, passHref, ...rest },
  ref,
) {
  if (typeof href === "string" && isAccountGroupPath(href)) {
    return <a ref={ref} href={href} {...rest} />;
  }
  return (
    <Link
      ref={ref}
      href={href}
      prefetch={prefetch}
      replace={replace}
      scroll={scroll}
      shallow={shallow}
      locale={locale}
      legacyBehavior={legacyBehavior}
      passHref={passHref}
      {...rest}
    />
  );
});
