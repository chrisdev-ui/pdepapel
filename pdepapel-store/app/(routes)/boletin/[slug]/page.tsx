import { Metadata } from "next";
import { notFound } from "next/navigation";

import { getNewsletterIssue } from "@/actions/get-newsletter-issue";
import { Container } from "@/components/ui/container";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { BASE_URL } from "@/constants";

export const revalidate = 300;

interface IssuePageProps {
  params: { slug: string };
}

export async function generateMetadata({
  params,
}: IssuePageProps): Promise<Metadata> {
  const issue = await getNewsletterIssue(params.slug);
  if (!issue) return { title: "Boletín" };

  return {
    title: `${issue.title} | Boletín P de Papel`,
    description:
      issue.intro ?? "El boletín de P de Papel: novedades, ideas y papelería.",
    alternates: { canonical: `${BASE_URL}/boletin/${issue.slug}` },
    openGraph: {
      title: issue.title,
      description: issue.intro ?? undefined,
      images: [{ url: issue.coverUrl }],
      type: "article",
    },
  };
}

const DATE = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "long",
  timeZone: "America/Bogota",
});

export default async function NewsletterIssuePage({ params }: IssuePageProps) {
  const issue = await getNewsletterIssue(params.slug);
  if (!issue) notFound();

  return (
    <Container>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-14">
        <header className="flex flex-col gap-3 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
            {issue.title}
          </h1>
          {issue.intro && (
            <p className="text-base leading-relaxed text-muted-foreground">
              {issue.intro}
            </p>
          )}
          {issue.sentAt && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {DATE.format(new Date(issue.sentAt))}
            </p>
          )}
        </header>

        {/*
          Las páginas son las imágenes que Paula exportó de Canva, en orden.
          La primera se carga con prioridad porque es lo que se ve al abrir el
          enlace del correo; el resto en diferido para no gastar ancho de banda
          de Cloudinary en páginas que quizá nadie baje a ver.
        */}
        <div className="flex flex-col gap-4">
          {issue.pages.map((page, index) => (
            <CloudinaryImage
              key={page.id}
              src={page.imageUrl}
              alt={page.alt ?? `${issue.title} · página ${index + 1}`}
              width={1200}
              height={1600}
              priority={index === 0}
              loading={index === 0 ? undefined : "lazy"}
              sizes="(min-width: 768px) 768px, 100vw"
              className="h-auto w-full rounded-xl border bg-white shadow-sm"
            />
          ))}
        </div>
      </article>
    </Container>
  );
}
