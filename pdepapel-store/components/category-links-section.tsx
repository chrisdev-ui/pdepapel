"use client";

import Image from "next/image";
import Link from "next/link";

import { categoryPath } from "@/lib/routes";
import { trackCustomerEvent } from "@/lib/customer-analytics";
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
        className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      >
        {categories.map((category) => (
          <Link
            key={category.id}
            href={categoryPath(category.slug || category.id)}
            aria-label={`Ver ${category.name}`}
            onClick={() =>
              trackCustomerEvent("select_category", {
                category_slug: category.slug || category.id,
                section: title,
              })
            }
            className="group relative aspect-square overflow-hidden rounded-2xl bg-kawaii-pink-light shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
          >
            {category.imageUrl ? (
              <Image
                src={category.imageUrl}
                alt={category.name}
                fill
                sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-kawaii-pink-light to-kawaii-blue-light" />
            )}
            <span className="absolute inset-x-4 bottom-4 rounded-full bg-white/95 px-3 py-2 text-center text-sm font-bold text-blue-yankees shadow-md backdrop-blur-sm sm:text-base">
              {category.name}
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
