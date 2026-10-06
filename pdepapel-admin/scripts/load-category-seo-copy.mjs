/**
 * Carga los textos SEO aprobados de 32 categorías y activa `seoEnabled` en 7.
 *
 * Fuente: docs/seo/2026-10-05-wave-3-phase-2-proposals.md, §B.2.2, copiados
 * literalmente (Christian aprueba en nombre de Paula, 2026-10-05). Solo filas
 * de Category de la tienda principal: `seoTitle`, `seoDescription`, `seoIntro`
 * en las 32 y, además, `seoEnabled: true` en las 7 del grupo B. Nunca toca
 * `seoFeatured`, nombre, slug, tipo, imagen ni productos. «Lego» recibe texto
 * pero sigue sin indexar (pendiente la pregunta de marca).
 *
 *   node --env-file=.env scripts/load-category-seo-copy.mjs [--dry-run]
 *       Solo lectura (usuario pdepapel_ro): valida, guarda la copia de
 *       respaldo y muestra el cambio. No gasta aprobación.
 *   npm run prod:write -- scripts/load-category-seo-copy.mjs --apply <copia.json>
 *   npm run prod:write -- scripts/load-category-seo-copy.mjs --revert <copia.json>
 *       Escritura con aprobación fresca (`npm run prod:approve -- "<motivo>"`).
 *       Una sola transacción; si no se actualizan exactamente las 32 filas,
 *       se revierte todo. `--revert` deja las 32 como en la copia.
 *
 * Cada UPDATE exige en el `where` el estado esperado (el de la copia al
 * aplicar, el nuevo al revertir): si alguien editó una categoría entre la
 * copia y la escritura, falla y no se escribe nada.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const STORE_ID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const FIELDS = ["seoEnabled", "seoFeatured", "seoTitle", "seoDescription", "seoIntro"];
/** La plantilla del layout añade « | Papelería P de Papel» (23 caracteres). */
const TITLE_MAX = 70;
const TITLE_SOFT_MAX = 47;
const DESCRIPTION_MAX = 155;
const DESCRIPTION_HARD_MAX = 170;
const INTRO_MAX = 1200;

/** `enable`: grupo B, pasa a `seoEnabled: true`. Ids resueltos con pdepapel_ro. */
const CATEGORIES = [
  {"id": "31d86a79-b144-4b3c-8c66-757e73d12648", "slug": "boligrafos-lapiceros", "label": "Escritura › Bolígrafos / Lapiceros", "enable": false, "seoTitle": "Lapiceros de gel, retráctiles y borrables", "seoDescription": "Lapiceros de gel, retráctiles, borrables, escarchados y multiminas, por unidad o en set, en tonos pastel y con personajes como Kuromi o Capibara.", "seoIntro": "La categoría más grande de la tienda: lapiceros de gel, retráctiles, semigel, roller, borrables, escarchados y multiminas, en puntas de 0.5 y 0.7 mm. Se venden por unidad o en sets de 3 a 10, en tonos pastel, degradé o tinta negra, y con personajes como Kuromi, Capibara, Intensamente o los escudos de Hogwarts."},
  {"id": "e6efdedd-ddde-4983-9c67-a329d24e887a", "slug": "marcadores", "label": "Escritura › Marcadores", "enable": false, "seoTitle": "Marcadores permanentes, acrílicos y más", "seoDescription": "Marcadores permanentes, acrílicos, de vinilo, escarchados, metalizados y borrables de tablero, por unidad o en sets de 4 a 36 colores.", "seoIntro": "Marcadores para cada proyecto: permanentes, acrílicos, de vinilo, escarchados y metalizados, de doble punta y de punta pincel para lettering, además de borrables para tablero. Hay sets de 4 a 36 colores y marcadores por unidad, de marcas como Sharpie, Tombow, Eterna y Gipao."},
  {"id": "64bad4ce-04df-455d-8a71-cdfb84caaf5a", "slug": "resaltadores", "label": "Escritura › Resaltadores", "enable": false, "seoTitle": "Resaltadores pastel, neón y borrables", "seoDescription": "Resaltadores pastel, neón y borrables, de doble punta o con personajes, por unidad o en sets de 3 a 15 colores para estudiar y subrayar.", "seoIntro": "Resaltadores para estudiar y organizar apuntes por colores: tonos pastel y neón, de doble punta, borrables y con personajes. Se consiguen por unidad o en sets de 3 a 15 colores, de marcas como Sharpie, Studmark y Gipao. Son útiles para subrayar textos, marcar fórmulas o separar temas en la agenda."},
  {"id": "c61abe64-0145-469e-9973-46277753ecf0", "slug": "plumones", "label": "Escritura › Plumones", "enable": false, "seoTitle": "Plumones de doble punta y punta pincel", "seoDescription": "Plumones de doble punta, punta pincel y punta cónica en sets de 8 a 24 colores, también en pastel y tonos tierra, para lettering y colorear.", "seoIntro": "Plumones para lettering, ilustración y mapas mentales: de doble punta, punta pincel, punta cónica y punta delgada, en sets de 8 a 24 colores. Además de los tonos clásicos hay sets pastel y de tonos tierra, de marcas como Offi-esco, Primavera y Scribe."},
  {"id": "94e8cc7b-414e-41ff-946c-6729eaba8a5d", "slug": "notas-adhesivas", "label": "Útiles › Notas adhesivas", "enable": false, "seoTitle": "Notas adhesivas de colores y personajes", "seoDescription": "Notas adhesivas pastel, neón, translúcidas, rayadas y con personajes como Hello Kitty, Stitch o Capibara, para estudiar y organizar pendientes.", "seoIntro": "Notas adhesivas para apuntes, recordatorios y libros: pastel, neón, negras, translúcidas para escribir encima del texto, con renglones o en formato de lista. Hay diseños de Hello Kitty, Stitch, Capibara y pandas, y otros con obras de Van Gogh y Monet."},
  {"id": "5c61cb8d-2f2e-40ba-acf8-e9f2d828bb05", "slug": "borradores", "label": "Útiles › Borradores", "enable": false, "seoTitle": "Borradores de miga de pan y kawaii", "seoDescription": "Borradores de miga de pan, retráctiles, eléctricos y con figuras de animales, por unidad o en set, para el colegio y el dibujo.", "seoIntro": "Borradores para cada uso: de miga de pan para dibujo, retráctiles con repuesto, eléctricos y para tablero, además de borradores con figuras de capibaras, pandas, conejos y pollitos. Se venden por unidad, en blíster de 3 o en sets de 5."},
  {"id": "c4698083-5c4d-40fa-8077-ee36bfbb2df1", "slug": "pegante", "label": "Útiles › Pegante", "enable": false, "seoTitle": "Pegante en barra, líquido y silicona", "seoDescription": "Pegante en barra, pegante líquido, silicona líquida de 30 y 60 ml y pegantes con personajes como Stitch, para tareas y manualidades.", "seoIntro": "Pegantes para el colegio y las manualidades: en barra, líquido, doble y transparente, y silicona líquida de 30 y 60 ml. Algunos vienen con diseños kawaii o con personajes como Stitch y dinosaurios. Sirven para tareas con papel y cartulina, maquetas y proyectos de journal."},
  {"id": "d0e9c269-554e-4b13-a2d9-6144db347fa7", "slug": "reglas", "label": "Útiles › Reglas", "enable": true, "seoTitle": "Reglas flexibles y con diseños kawaii", "seoDescription": "Reglas flexibles, pastel y con diseños de Stitch, Cinnamoroll, capibaras, animales y flores para el colegio y el journal.", "seoIntro": "Reglas para el estuche que se salen de lo común: flexibles, en tonos pastel y con diseños de Stitch, Cinnamoroll, capibaras, animalitos y flores. Sirven para geometría, para los márgenes del cuaderno o para trazar en el journal. Son un buen detalle para completar un estuche nuevo."},
  {"id": "2b9c7938-6610-4e00-ba30-dd6531e1fde1", "slug": "bisturies", "label": "Útiles › Bisturíes", "enable": false, "seoTitle": "Bisturíes y cuchillas de repuesto", "seoDescription": "Bisturíes grandes y mini, tipo lapicero, en pastel o con Sanrio, y cuchillas de repuesto para manualidades y scrapbook.", "seoIntro": "Bisturíes para cortes precisos en manualidades, maquetas y scrapbook: grandes y mini, tipo lapicero, en pastel, con forma de cactus o de Sanrio, además de cuchillas de repuesto. Úsalos sobre un tapete de corte y guárdalos lejos de los niños pequeños."},
  {"id": "66483e2e-7008-4add-9130-202e7a057da1", "slug": "llaveros", "label": "Accesorios › Llaveros", "enable": false, "seoTitle": "Llaveros de personajes y de peluche", "seoDescription": "Llaveros de peluche, de agua y de lujo con personajes como Stitch, Bluey, Minions, Harry Potter o Toy Story, para la maleta, las llaves o regalar.", "seoIntro": "Llaveros para colgar en la maleta, las llaves o la cartuchera: de peluche, de agua con brillos, sencillos y de lujo. Hay personajes de películas y series como Toy Story, Intensamente, Minions, Bluey, Bob Esponja, Harry Potter y Sanrio, así que es fácil encontrar uno para cada fan."},
  {"id": "9d6376c0-356a-4ea9-bcbb-b7a809ac4be5", "slug": "porta-carnets", "label": "Accesorios › Porta carnets", "enable": true, "seoTitle": "Portacarnets con personajes", "seoDescription": "Portacarnets con yoyo y diseños de Dragon Ball, Pokémon, One Piece, Doraemon, Kuromi y más, para el carnet del colegio o del trabajo.", "seoIntro": "Portacarnets para llevar a la vista el carnet del colegio, la universidad o el trabajo. Algunos tienen yoyo retráctil, y vienen con personajes de anime y caricaturas como Dragon Ball, Pokémon, One Piece, Doraemon, Bob Esponja, Stitch o Kuromi. También sirven para llevar la tarjeta del transporte o del gimnasio."},
  {"id": "482ba00c-8d43-4b0c-b9f4-5245a5f7f2d9", "slug": "mugs", "label": "Accesorios › Mugs", "enable": false, "seoTitle": "Mugs y tazas de cerámica", "seoDescription": "Mugs, tazones herméticos y sets de plato y mug en cerámica con gatos, patitas, Snoopy y diseños de temporada. Para tu café o para regalar.", "seoIntro": "Mugs y piezas de cerámica para el desayuno o el escritorio: tazas con gatos, patitas y animales, un set de plato y mug de conejito, platos y un tazón hermético de Snoopy. Funcionan bien como regalo de cumpleaños o de amigo secreto."},
  {"id": "6b17c1f5-faa4-4d9e-bf1b-25abd9a714c6", "slug": "pines", "label": "Accesorios › Pines", "enable": true, "seoTitle": "Pines de personajes y anime", "seoDescription": "Pines de Harry Potter, Stitch, One Piece, Intensamente, Pusheen o Timón y Pumba para decorar tu morral, tu chaqueta o la cartuchera.", "seoIntro": "Pines para personalizar un morral, una chaqueta, una gorra o la cartuchera. Hay diseños de Harry Potter, Stitch, One Piece, Intensamente, Pusheen, Timón y Pumba, capibaras y gatos, y combinan bien si quieres armar tu propia colección. Son un regalo pequeño y fácil para fans de una película o una serie."},
  {"id": "3ff0f1a2-1dea-4170-98cf-2f6fd81da426", "slug": "stickers", "label": "Journal / Scrap › Stickers", "enable": false, "seoTitle": "Stickers para journal, agenda y scrapbook", "seoDescription": "Sobres y láminas de stickers florales, vintage, en relieve y de personajes como Hello Kitty, Snoopy o El Principito, para journal y agendas.", "seoIntro": "Stickers para decorar journals, agendas, cuadernos y tarjetas: sobres de stickers florales y vintage, láminas de El Principito, Snoopy 3D y Hello Kitty, stickers en relieve, metalizados, en vinilo transparente y en rollo. También hay plantillas para bullet journal y paquetes kawaii surtidos."},
  {"id": "e6d6e5c2-03e9-43d8-812a-da55e5eda63f", "slug": "troqueles", "label": "Journal / Scrap › Troqueles", "enable": false, "seoTitle": "Troqueles y perforadoras para scrapbook", "seoDescription": "Troqueles de figuras y de borde, perforadoras de encaje, cortador de puntas redondas y corrugador de papel para scrapbook y journal.", "seoIntro": "Herramientas para cortar y dar forma al papel: troqueles de figuras de 1 cm, de borde y de punta encaje, un troquel de anillado, cortador de puntas redondas, corrugador de papel y tapete de corte. Sirven para hacer tarjetas, etiquetas y bordes decorativos en scrapbook y journal."},
  {"id": "9dd9ff6f-59d3-4eb4-ab40-61b08cbc4ee8", "slug": "agendas", "label": "Planeación & Organización › Agendas", "enable": false, "seoTitle": "Agendas A5, mini y permanentes", "seoDescription": "Agendas A5, mini y permanentes con diseños de Harry Potter, El Principito, One Piece, arte clásico y pastel para organizar estudio y trabajo.", "seoIntro": "Agendas para planear clases, trabajo y metas: A5, mini y permanentes (sin fechas impresas), con portadas de Harry Potter y las casas de Hogwarts, El Principito, One Piece, ilustraciones de William Morris y Henri Le Sidaner, o diseños pastel y acolchados."},
  {"id": "546aa796-1fb4-4508-aec2-7455e2fa3189", "slug": "planeadores", "label": "Planeación & Organización › Planeadores", "enable": true, "seoTitle": "Planeadores diarios, semanales y mensuales", "seoDescription": "Planeadores diarios, semanales y mensuales, verticales y en block, con flores, Sanrio, Stitch y Capibara, para organizar tareas y pendientes.", "seoIntro": "Planeadores para ver el día, la semana o el mes de un vistazo: daily planners verticales, planeadores semanales y mensuales, blocks de hojas y listas de pendientes. Hay diseños de flores, dorados y girly, y personajes como Sanrio, Stitch, Capibara y gatos."},
  {"id": "9a390db6-d4c5-4345-b3ea-7be7f78e30b2", "slug": "argollados", "label": "Cuadernos › Argollados", "enable": false, "seoTitle": "Cuadernos argollados rayados y cuadriculados", "seoDescription": "Cuadernos argollados de 1 y 5 materias, grandes y pequeños, rayados o cuadriculados, con Snoopy, Mafalda, Hello Kitty, Stitch y BTS.", "seoIntro": "Cuadernos argollados para clase y apuntes: grandes y pequeños, de una o cinco materias, de 60 y 80 hojas, rayados o cuadriculados. Hay portadas de Snoopy, Mafalda, Hello Kitty, Pochacco, Stitch, BTS y Disney, además de diseños lisos y kraft para quien prefiere algo sencillo."},
  {"id": "b66a6726-3ca0-463a-93b8-c64ac31d1ef4", "slug": "libretas", "label": "Cuadernos › Libretas", "enable": false, "seoTitle": "Libretas de bolsillo y media carta", "seoDescription": "Libretas pequeñas, de bolsillo, de resorte y media carta, con gatos, capibaras, pandas y flores, para apuntar ideas o llevar en la cartuchera.", "seoIntro": "Libretas para tener siempre a mano: de bolsillo, mini, de resorte y media carta, algunas cuadriculadas y otras con hojas negras. Los diseños van de gatitos y capibaras a pandas, flores y Lotso, y caben en la cartuchera o el bolso para anotar ideas, listas o dibujos rápidos."},
  {"id": "560324ca-165a-45d1-90b5-559bbe7873ba", "slug": "cosidos", "label": "Cuadernos › Cosidos", "enable": false, "seoTitle": "Cuadernos cosidos de 50 y 100 hojas", "seoDescription": "Cuadernos cosidos rayados, cuadriculados, de puntos y doble línea, de 50 y 100 hojas, con Snoopy, One Piece y diseños girly.", "seoIntro": "Cuadernos cosidos, sin argollas que se enreden en la maleta: de 50 y 100 hojas, en rayado, cuadriculado, puntos y doble línea para practicar letra. Hay portadas de Snoopy, One Piece, personajes y diseños girly. Funcionan para el colegio, la universidad o para llevar un diario."},
  {"id": "444211b4-3d88-4d50-9539-0d4448779717", "slug": "lapices", "label": "Lápices & Colores › Lápices", "enable": false, "seoTitle": "Lápices infinitos y lápices HB", "seoDescription": "Lápices infinitos con figuras, lápices HB y cajas de lápices pastel por unidad o en caja, con gatos, perritos, sirenas y personajes.", "seoIntro": "Lápices para escribir y dibujar: lápices infinitos, que no necesitan tajalápiz, con figuras de gatos, perritos, ositos, aguacates o sirenas, lápices HB como el Mirado #2 y cajas de 6 a 12 unidades en tonos pastel o con personajes. Son útiles para el colegio, para bocetar y para armar un kit de regalo."},
  {"id": "d8c8cd8f-bbbe-4288-9eea-9c0158404e34", "slug": "portaminas", "label": "Lápices & Colores › Portaminas", "enable": true, "seoTitle": "Portaminas de 0.5, 0.7 y 2.0 mm", "seoDescription": "Portaminas de 0.5, 0.7 y 2.0 mm, metálicos, pastel y con personajes como Pochacco o Pompompurin; algunos traen minas de repuesto.", "seoIntro": "Portaminas para escribir sin tajar: de 0.5 y 0.7 mm para apuntes y de 2.0 mm para dibujo y bocetos. Hay modelos metálicos, en tonos pastel o mármol y con personajes como Pochacco, Pompompurin, gatos y perritos; algunos traen repuesto de minas."},
  {"id": "e36f5eab-a21f-4991-95fa-53afe3f50bf4", "slug": "colores", "label": "Lápices & Colores › Colores", "enable": false, "seoTitle": "Cajas de colores de 12 a 36 tonos", "seoDescription": "Cajas de colores de 12 a 36 tonos, de doble punta, triangulares y en caja metálica, de Norma, Scribe y Offi-esco, para colorear e ilustrar.", "seoIntro": "Colores para colorear, ilustrar y hacer tareas: cajas de 12 a 36 tonos, de doble punta, triangulares en pastel y en caja metálica. Hay marcas como Norma, Scribe y Offi-esco, y una caja de Disney Junior para los más pequeños."},
  {"id": "2d87969e-dc2e-447c-87e4-4d4b00c14768", "slug": "herramientas-de-oficina", "label": "Oficina › Herramientas de oficina", "enable": false, "seoTitle": "Grapadoras, perforadoras y más para oficina", "seoDescription": "Grapadoras mini y medianas, perforadoras de 1 y 2 huecos, dispensadores de cinta, lupas y una mini impresora térmica, en pastel y con personajes.", "seoIntro": "Herramientas para el escritorio que también se ven bonitas: grapadoras mini y medianas con sus ganchos, perforadoras de uno y dos huecos, dispensador de cinta y lupa, en colores pastel o con Stitch, Kuromi y Capibara. También hay una mini impresora térmica."},
  {"id": "30e47141-1064-41ca-bddd-3d88a44c4ba6", "slug": "blocks-de-papel", "label": "Oficina › Blocks de papel", "enable": false, "seoTitle": "Blocks rayados, cuadriculados e iris", "seoDescription": "Blocks carta y media carta rayados o cuadriculados, blocks de hojas blancas carta y oficio, y block iris de colores para tareas y manualidades.", "seoIntro": "Blocks para tareas, trabajos y manualidades: carta y media carta en rayado o cuadriculado, hojas blancas tamaño carta y oficio de 70 hojas, y block iris en tonos pastel o de 35 hojas de colores. Son una forma práctica de tener hojas sueltas para el colegio o la oficina."},
  {"id": "11b25ec5-4aa4-4323-aa75-74f15b6601c5", "slug": "papeles", "label": "Oficina › Papeles", "enable": false, "seoTitle": "Cartulinas, papel crepé y papel acuarela", "seoDescription": "Cartulina de colores, papel crepé por pliego, cartulina para acuarela, block iris neón y rollos para mini impresora térmica.", "seoIntro": "Papeles para manualidades y proyectos del colegio: cartulina de 1/8 en tonos fuertes, papel crepé por pliego, cartulina para acuarela y block iris neón con formas. También están los rollos de repuesto, normales y de sticker, para la mini impresora térmica."},
  {"id": "f9ed49cb-6e18-40db-a44f-a8316bbcff78", "slug": "cartucheras", "label": "Bolsos & Morrales › Cartucheras", "enable": false, "seoTitle": "Cartucheras kawaii y de varios bolsillos", "seoDescription": "Cartucheras de uno o varios bolsillos, tipo maleta e impermeables, y cosmetiqueras, con diseños de Sanrio, capibaras y estilo retro o pastel.", "seoIntro": "Cartucheras para llevar lapiceros, colores y todo lo del estuche en orden: de un bolsillo, de varios compartimentos, tipo maleta e impermeables, además de cosmetiqueras de tela. Hay diseños de Sanrio como Hello Kitty y Hangyodon, capibaras, cajitas de leche kawaii y estilos retro o pastel."},
  {"id": "29e7b364-04d4-4ebc-b84d-69ff5c9d8777", "slug": "separadores-de-paginas", "label": "Lectura › Separadores de páginas", "enable": true, "seoTitle": "Separadores de páginas imantados", "seoDescription": "Separadores de libros imantados, de cadena y en forma de pluma, con flores, obras de arte, El Principito y Harry Potter. Por unidad o en set.", "seoIntro": "Separadores para no perder la página: imantados, de cadena, en forma de pluma y en sets de 2 o 4. Tienen ilustraciones de flores, obras de arte, El Principito y Harry Potter, y son un buen complemento para regalar con un libro."},
  {"id": "bc7dd508-51c3-4390-ab0d-440ebcf90286", "slug": "banderitas-adhesivas", "label": "Lectura › Banderitas adhesivas", "enable": true, "seoTitle": "Banderitas adhesivas para marcar páginas", "seoDescription": "Banderitas adhesivas de colores, con abecedario y en tonos Morandi, para marcar páginas de libros, apuntes y agendas.", "seoIntro": "Banderitas adhesivas para señalar citas en un libro, temas en los apuntes o fechas en la agenda. Hay paquetes de varios colores, con abecedario para indexar y en tonos Morandi. Funcionan bien para estudiar, para clubes de lectura o para organizar documentos del trabajo."},
  {"id": "7238f2c4-fc47-44ba-8fcf-27f5bae2e877", "slug": "monas-pinzas", "label": "Belleza / Cuidado Personal › Moñas / Pinzas", "enable": false, "seoTitle": "Scrunchies, moñas y pinzas para el cabello", "seoDescription": "Scrunchies de flores, encaje y perlas, moñas con lazo y pinzas como la de Kuromi para recoger el cabello con un detalle bonito.", "seoIntro": "Accesorios para el cabello con detalles delicados: scrunchies de florecitas, encaje y perlas, moñas con lazo o flor doble y pinzas como la de Kuromi o la de lazo tornasol. Son un complemento fácil para el día a día o un detalle pequeño para regalar."},
  {"id": "a8729e87-34ae-494d-944b-b3a09bab3a42", "slug": "lego", "label": "Creatividad & Juego › Lego", "enable": false, "seoTitle": "Bloques de construcción de personajes", "seoDescription": "Sets de bloques para armar personajes de Mario Bros, Bob Esponja, Winnie Pooh, Psyduck, superhéroes y un panda.", "seoIntro": "Sets de bloques para armar figuras de personajes conocidos: Mario Bros, Bob Esponja y sus amigos, Winnie Pooh, Psyduck, superhéroes o un panda. Son un pasatiempo para niños y adultos y un regalo diferente para quien colecciona figuras. Se pueden armar en familia y después quedan como figura de colección."},
  {"id": "16408ada-f8b8-4f41-9b88-d983aba64467", "slug": "kits-para-regalar-o-regalarse", "label": "Kits › Kits para regalar o regalarse", "enable": false, "seoTitle": "Kits de papelería para regalar", "seoDescription": "Kits armados de papelería con temas como Pochacco, Hogwarts, gatos y capibaras, además de kits de apuntes y de arte, listos para regalar.", "seoIntro": "Kits de papelería ya armados, para regalar sin tener que escoger cada pieza: hay kits temáticos de Pochacco, las casas de Hogwarts, gatos y capibaras, además de un kit básico de apuntes y otro de arte. También sirven para darse un gusto o para empezar un pasatiempo nuevo."},
];

const [mode = "--dry-run", backupArg] = process.argv.slice(2);
if (!["--dry-run", "--apply", "--revert"].includes(mode)) throw new Error("uso: [--dry-run] | --apply <copia.json> | --revert <copia.json>");
if (mode !== "--dry-run" && !backupArg) throw new Error(`${mode} necesita la copia de respaldo del ensayo`);

function validate() {
  const problems = [];
  const warnings = [];
  if (CATEGORIES.length !== 32) problems.push(`se esperaban 32 categorías, hay ${CATEGORIES.length}`);
  if (new Set(CATEGORIES.map((row) => row.id)).size !== CATEGORIES.length) problems.push("ids repetidos");
  if (CATEGORIES.filter((row) => row.enable).length !== 7) problems.push("el grupo B debe tener 7 categorías");
  for (const row of CATEGORIES) {
    for (const field of ["seoTitle", "seoDescription", "seoIntro"]) {
      if (!row[field] || !row[field].trim()) problems.push(`${row.slug}: ${field} vacío`);
    }
    const title = [...(row.seoTitle ?? "")].length;
    const description = [...(row.seoDescription ?? "")].length;
    const intro = [...(row.seoIntro ?? "")].length;
    if (title > TITLE_MAX) problems.push(`${row.slug}: seoTitle ${title} > ${TITLE_MAX}`);
    else if (title > TITLE_SOFT_MAX) warnings.push(`${row.slug}: seoTitle ${title} > ${TITLE_SOFT_MAX} (el <title> completo pasa de 70)`);
    if (description > DESCRIPTION_HARD_MAX) problems.push(`${row.slug}: seoDescription ${description} > ${DESCRIPTION_HARD_MAX}`);
    else if (description > DESCRIPTION_MAX) problems.push(`${row.slug}: seoDescription ${description} > ${DESCRIPTION_MAX}`);
    if (intro > INTRO_MAX) problems.push(`${row.slug}: seoIntro ${intro} > ${INTRO_MAX}`);
  }
  return { problems, warnings };
}

const target = (row, current) => ({
  seoTitle: row.seoTitle,
  seoDescription: row.seoDescription,
  seoIntro: row.seoIntro,
  seoEnabled: row.enable ? true : current.seoEnabled,
});
const short = (value) => (typeof value === "string" && value.length > 60 ? `${value.slice(0, 57)}…` : JSON.stringify(value));

const { problems, warnings } = validate();
if (problems.length) {
  console.log(JSON.stringify({ aborted: "validación", problems }, null, 1));
  process.exit(1);
}

let db;
if (mode === "--dry-run") {
  const require = createRequire(`${process.cwd()}/package.json`);
  const { PrismaClient } = require("@prisma/client");
  db = new PrismaClient();
} else {
  const { createProdClient } = await import("./lib/prod-client.mjs");
  db = createProdClient();
}

const select = { id: true, slug: true, storeId: true, isArchived: true, seoEnabled: true, seoFeatured: true, seoTitle: true, seoDescription: true, seoIntro: true };

try {
  const current = await db.category.findMany({ where: { storeId: STORE_ID, id: { in: CATEGORIES.map((row) => row.id) } }, select });
  const byId = new Map(current.map((row) => [row.id, row]));
  const missing = CATEGORIES.filter((row) => !byId.has(row.id) || byId.get(row.id).slug !== row.slug || byId.get(row.id).isArchived);
  if (missing.length) throw new Error(`categorías que faltan, cambiaron de slug o están archivadas: ${missing.map((row) => row.slug).join(", ")}`);

  if (mode === "--dry-run") {
    const takenAt = new Date().toISOString();
    const dir = join(homedir(), "pdepapel-backups", takenAt.slice(0, 10));
    mkdirSync(dir, { recursive: true });
    const backupPath = join(dir, `category-seo-copy-${takenAt.replace(/[:.]/g, "-")}.json`);
    const backup = { takenAt, storeId: STORE_ID, rows: CATEGORIES.map((row) => Object.fromEntries([["id", row.id], ["slug", row.slug], ...FIELDS.map((field) => [field, byId.get(row.id)[field]])])) };
    writeFileSync(backupPath, JSON.stringify(backup, null, 1), { mode: 0o600 });
    for (const row of CATEGORIES) {
      const now = byId.get(row.id);
      const next = target(row, now);
      const changes = Object.keys(next).filter((field) => next[field] !== now[field]).map((field) => `${field}: ${short(now[field])} → ${short(next[field])}`);
      console.log(`${row.enable ? "[B] " : "    "}${row.id} | ${row.slug}\n      ${changes.length ? changes.join("\n      ") : "sin cambios"}`);
    }
    console.log(JSON.stringify({ mode, rows: CATEGORIES.length, seoEnabledToTrue: CATEGORIES.filter((row) => row.enable && !byId.get(row.id).seoEnabled).map((row) => row.slug), warnings, backup: backupPath }, null, 1));
  } else {
    const backup = JSON.parse(readFileSync(backupArg, "utf8"));
    const saved = new Map(backup.rows.map((row) => [row.id, row]));
    if (backup.storeId !== STORE_ID || saved.size !== CATEGORIES.length || CATEGORIES.some((row) => !saved.has(row.id))) throw new Error("la copia no corresponde a estas 32 categorías");

    const updated = await db.$transaction(async (tx) => {
      let count = 0;
      for (const row of CATEGORIES) {
        const copy = saved.get(row.id);
        const applied = { ...target(row, copy), seoFeatured: copy.seoFeatured };
        const [expected, data] = mode === "--apply"
          ? [copy, target(row, copy)]
          : [applied, Object.fromEntries(FIELDS.filter((field) => field !== "seoFeatured").map((field) => [field, copy[field]]))];
        const result = await tx.category.updateMany({
          where: {
            id: row.id,
            storeId: STORE_ID,
            seoEnabled: expected.seoEnabled,
            seoFeatured: expected.seoFeatured,
            seoTitle: expected.seoTitle,
            seoDescription: expected.seoDescription,
            seoIntro: expected.seoIntro,
          },
          data,
        });
        if (result.count !== 1) throw new Error(`${row.slug}: se esperaba 1 fila, se actualizaron ${result.count} (¿la editaron desde la copia?). Se revierte todo.`);
        count += result.count;
      }
      if (count !== CATEGORIES.length) throw new Error(`se esperaban ${CATEGORIES.length} filas, fueron ${count}. Se revierte todo.`);
      return count;
      // Prisma corta una transacción interactiva a los 5 s por defecto; 32
      // UPDATE seguidos contra Railway tardaron 5,1 s y la primera corrida
      // falló con P2028 sin escribir nada (2026-10-06). Mismo todo o nada,
      // más margen. Vale para --apply y --revert, que comparten este bloque.
    }, { timeout: 60_000, maxWait: 10_000 });

    const after = await db.category.findMany({ where: { id: { in: CATEGORIES.map((row) => row.id) } }, select });
    console.log(`PROD_WRITE_ROWS=${updated}`);
    console.log(JSON.stringify({ mode, updated, seoEnabledTrue: after.filter((row) => row.seoEnabled).length, groupB: after.filter((row) => CATEGORIES.find((c) => c.id === row.id).enable).map((row) => `${row.slug}=${row.seoEnabled}`) }, null, 1));
  }
} finally {
  await db.$disconnect();
}
