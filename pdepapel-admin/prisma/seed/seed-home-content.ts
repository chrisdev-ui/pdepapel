import { fakerES_MX as faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";

export async function seedHomeContent(storeId: string, prismadb: PrismaClient) {
  const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prismadb.homeContent.createMany({
    data: [
      {
        storeId,
        placement: "HERO",
        eyebrow: "Nuevo esta semana",
        title: "Papelería kawaii desde Medellín con envíos a toda Colombia",
        subtitle: faker.lorem.sentence(),
        primaryLabel: "Ver la tienda",
        primaryUrl: "/tienda",
        imageUrl: faker.image.urlLoremFlickr({ width: 1280, height: 800 }),
        imageAlt: faker.lorem.words(4),
      },
      {
        storeId,
        placement: "CAMPAIGN",
        campaignType: "SEASON",
        eyebrow: "Temporada escolar",
        title: faker.lorem.sentence(6),
        subtitle: faker.lorem.sentence(),
        primaryLabel: "Ver los kits",
        primaryUrl: "/tienda",
        imageUrl: faker.image.urlLoremFlickr({ width: 1040, height: 600 }),
        endsAt: inThirtyDays,
      },
    ],
  });

  console.log("Home content seeded successfully!");
}
