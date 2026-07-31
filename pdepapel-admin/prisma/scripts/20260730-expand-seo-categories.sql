UPDATE `Category`
SET `seoEnabled` = FALSE, `seoFeatured` = FALSE
WHERE `id` = '482ba00c-8d43-4b0c-b9f4-5245a5f7f2d9';

UPDATE `Category`
SET
  `seoEnabled` = TRUE,
  `seoTitle` = CASE `id`
    WHEN '94e8cc7b-414e-41ff-946c-6729eaba8a5d' THEN 'Notas adhesivas bonitas y kawaii en Colombia | P de Papel'
    WHEN '2d87969e-dc2e-447c-87e4-4d4b00c14768' THEN 'Herramientas de oficina en Colombia | P de Papel'
    WHEN '9a390db6-d4c5-4345-b3ea-7be7f78e30b2' THEN 'Argollados y cuadernos argollados en Colombia | P de Papel'
    WHEN 'f9ed49cb-6e18-40db-a44f-a8316bbcff78' THEN 'Cartucheras bonitas y kawaii en Colombia | P de Papel'
    WHEN 'b66a6726-3ca0-463a-93b8-c64ac31d1ef4' THEN 'Libretas bonitas y creativas en Colombia | P de Papel'
    WHEN '444211b4-3d88-4d50-9539-0d4448779717' THEN 'Lápices bonitos y kawaii en Colombia | P de Papel'
    WHEN '5c61cb8d-2f2e-40ba-acf8-e9f2d828bb05' THEN 'Borradores bonitos y kawaii en Colombia | P de Papel'
  END,
  `seoDescription` = CASE `id`
    WHEN '94e8cc7b-414e-41ff-946c-6729eaba8a5d' THEN 'Compra notas adhesivas bonitas y kawaii para estudiar, organizarte y decorar. Encuentra tus favoritas con envíos a toda Colombia.'
    WHEN '2d87969e-dc2e-447c-87e4-4d4b00c14768' THEN 'Encuentra herramientas de oficina para estudiar, trabajar y organizar tus ideas. Compra papelería práctica y creativa con envíos a Colombia.'
    WHEN '9a390db6-d4c5-4345-b3ea-7be7f78e30b2' THEN 'Compra argollados y cuadernos para clases, apuntes y proyectos. Encuentra diseños bonitos y funcionales con envíos a toda Colombia.'
    WHEN 'f9ed49cb-6e18-40db-a44f-a8316bbcff78' THEN 'Descubre cartucheras bonitas y kawaii para guardar tus útiles con estilo. Compra diseños creativos con envíos a toda Colombia.'
    WHEN 'b66a6726-3ca0-463a-93b8-c64ac31d1ef4' THEN 'Encuentra libretas bonitas y creativas para escribir, dibujar y organizarte. Compra papelería especial con envíos a toda Colombia.'
    WHEN '444211b4-3d88-4d50-9539-0d4448779717' THEN 'Compra lápices bonitos y kawaii para estudiar, dibujar y crear. Encuentra papelería creativa con envíos a toda Colombia.'
    WHEN '5c61cb8d-2f2e-40ba-acf8-e9f2d828bb05' THEN 'Encuentra borradores bonitos y kawaii para tus clases y tu escritorio. Compra útiles creativos con envíos a toda Colombia.'
  END,
  `seoIntro` = CASE `id`
    WHEN '94e8cc7b-414e-41ff-946c-6729eaba8a5d' THEN 'Organiza tus ideas y destaca tus pendientes con notas adhesivas bonitas y kawaii para estudiar, trabajar y crear a tu manera.'
    WHEN '2d87969e-dc2e-447c-87e4-4d4b00c14768' THEN 'Encuentra herramientas de oficina prácticas y creativas para mantener tu escritorio, tareas y proyectos siempre en orden.'
    WHEN '9a390db6-d4c5-4345-b3ea-7be7f78e30b2' THEN 'Descubre argollados y cuadernos funcionales para acompañar clases, apuntes, metas y cada proyecto importante.'
    WHEN 'f9ed49cb-6e18-40db-a44f-a8316bbcff78' THEN 'Elige cartucheras bonitas y kawaii para llevar tus útiles favoritos, organizar tu escritorio y regalar algo especial.'
    WHEN 'b66a6726-3ca0-463a-93b8-c64ac31d1ef4' THEN 'Encuentra libretas bonitas y creativas para apuntar ideas, dibujar, escribir y hacer especiales tus días.'
    WHEN '444211b4-3d88-4d50-9539-0d4448779717' THEN 'Descubre lápices bonitos y kawaii para escribir, dibujar y llenar de creatividad tus clases y proyectos.'
    WHEN '5c61cb8d-2f2e-40ba-acf8-e9f2d828bb05' THEN 'Encuentra borradores bonitos y kawaii que hacen más divertidas tus clases, apuntes y momentos creativos.'
  END
WHERE `id` IN (
  '94e8cc7b-414e-41ff-946c-6729eaba8a5d',
  '2d87969e-dc2e-447c-87e4-4d4b00c14768',
  '9a390db6-d4c5-4345-b3ea-7be7f78e30b2',
  'f9ed49cb-6e18-40db-a44f-a8316bbcff78',
  'b66a6726-3ca0-463a-93b8-c64ac31d1ef4',
  '444211b4-3d88-4d50-9539-0d4448779717',
  '5c61cb8d-2f2e-40ba-acf8-e9f2d828bb05'
);

UPDATE `Category`
SET `seoFeatured` = TRUE
WHERE `id` IN (
  '3ff0f1a2-1dea-4170-98cf-2f6fd81da426',
  '31d86a79-b144-4b3c-8c66-757e73d12648',
  '94e8cc7b-414e-41ff-946c-6729eaba8a5d',
  '9dd9ff6f-59d3-4eb4-ab40-61b08cbc4ee8',
  '64bad4ce-04df-455d-8a71-cdfb84caaf5a',
  'bee4652f-0b37-4e02-85a5-7c187139ee18',
  'e6efdedd-ddde-4983-9c67-a329d24e887a',
  '66483e2e-7008-4add-9130-202e7a057da1'
);
