import Link from "next/link";

import { categoryPath } from "@/lib/routes";
import { Category } from "@/types";

interface CategoryLinksSectionProps {
  categories: Category[];
  title?: string;
  description?: string;
}

export function CategoryLinksSection({
  categories,
  title = "Explora por categoría",
  description = "Encuentra papelería creativa para estudiar, organizarte y regalar.",
}: CategoryLinksSectionProps) {
  if (categories.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:px-10">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-3xl font-extrabold">{title}</h2>
        <p className="mt-2 text-muted-foreground">{description}</p>
      </div>
      <nav
        aria-label={title}
        className="mt-6 flex flex-wrap justify-center gap-3"
      >
        {categories.map((category) => (
          <Link
            key={category.id}
            href={categoryPath(category.slug || category.id)}
            className="rounded-full border border-kawaii-pink bg-white px-5 py-2 text-sm font-semibold text-blue-yankees transition-colors hover:bg-kawaii-pink hover:text-white"
          >
            {category.name}
          </Link>
        ))}
      </nav>
    </section>
  );
}
