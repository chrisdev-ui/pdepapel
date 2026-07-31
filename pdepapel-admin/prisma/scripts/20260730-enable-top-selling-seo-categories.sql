UPDATE `Category`
SET
  `seoEnabled` = TRUE,
  `seoTitle` = CASE `id`
    WHEN '3ff0f1a2-1dea-4170-98cf-2f6fd81da426' THEN 'Stickers kawaii y decorativos en Colombia | P de Papel'
    WHEN '31d86a79-b144-4b3c-8c66-757e73d12648' THEN 'Bolígrafos y lapiceros bonitos en Colombia | P de Papel'
    WHEN '482ba00c-8d43-4b0c-b9f4-5245a5f7f2d9' THEN 'Mugs kawaii y tazas originales en Colombia | P de Papel'
    WHEN '9dd9ff6f-59d3-4eb4-ab40-61b08cbc4ee8' THEN 'Agendas bonitas y kawaii en Colombia | P de Papel'
    WHEN '64bad4ce-04df-455d-8a71-cdfb84caaf5a' THEN 'Resaltadores bonitos y kawaii en Colombia | P de Papel'
    WHEN 'bee4652f-0b37-4e02-85a5-7c187139ee18' THEN 'Blocks de hojas decorativas en Colombia | P de Papel'
    WHEN 'e6efdedd-ddde-4983-9c67-a329d24e887a' THEN 'Marcadores bonitos y creativos en Colombia | P de Papel'
    WHEN '66483e2e-7008-4add-9130-202e7a057da1' THEN 'Llaveros kawaii y originales en Colombia | P de Papel'
  END,
  `seoDescription` = CASE `id`
    WHEN '3ff0f1a2-1dea-4170-98cf-2f6fd81da426' THEN 'Compra stickers kawaii, decorativos y para journaling. Personaliza cuadernos, agendas y regalos con envíos a toda Colombia.'
    WHEN '31d86a79-b144-4b3c-8c66-757e73d12648' THEN 'Encuentra bolígrafos y lapiceros bonitos para estudiar, trabajar y regalar. Compra papelería creativa con envíos a toda Colombia.'
    WHEN '482ba00c-8d43-4b0c-b9f4-5245a5f7f2d9' THEN 'Descubre mugs kawaii y tazas originales para regalar o acompañar tu rutina. Compra diseños creativos con envíos a toda Colombia.'
    WHEN '9dd9ff6f-59d3-4eb4-ab40-61b08cbc4ee8' THEN 'Compra agendas bonitas y kawaii para organizar tus días. Encuentra diseños creativos para estudio y trabajo con envíos a toda Colombia.'
    WHEN '64bad4ce-04df-455d-8a71-cdfb84caaf5a' THEN 'Encuentra resaltadores bonitos y kawaii para estudiar, escribir y organizarte. Compra papelería creativa con envíos a toda Colombia.'
    WHEN 'bee4652f-0b37-4e02-85a5-7c187139ee18' THEN 'Compra blocks de hojas decorativas para journaling, manualidades y papelería creativa. Recibe tus favoritos en toda Colombia.'
    WHEN 'e6efdedd-ddde-4983-9c67-a329d24e887a' THEN 'Descubre marcadores bonitos y creativos para estudiar, dibujar y organizarte. Compra papelería kawaii con envíos a toda Colombia.'
    WHEN '66483e2e-7008-4add-9130-202e7a057da1' THEN 'Encuentra llaveros kawaii y originales para decorar, coleccionar o regalar. Compra diseños creativos con envíos a toda Colombia.'
  END,
  `seoIntro` = CASE `id`
    WHEN '3ff0f1a2-1dea-4170-98cf-2f6fd81da426' THEN 'Explora stickers kawaii y decorativos para personalizar agendas, cuadernos, tarjetas y regalos. Encuentra nuevos diseños para crear a tu manera.'
    WHEN '31d86a79-b144-4b3c-8c66-757e73d12648' THEN 'Elige bolígrafos y lapiceros bonitos para darle color a tus apuntes, tu escritorio y cada idea que quieras escribir.'
    WHEN '482ba00c-8d43-4b0c-b9f4-5245a5f7f2d9' THEN 'Encuentra mugs kawaii y tazas originales que hacen especiales tus pausas, tus regalos y tus momentos favoritos.'
    WHEN '9dd9ff6f-59d3-4eb4-ab40-61b08cbc4ee8' THEN 'Organiza tus metas, clases y proyectos con agendas bonitas y kawaii que convierten cada día en una nueva inspiración.'
    WHEN '64bad4ce-04df-455d-8a71-cdfb84caaf5a' THEN 'Haz que tus apuntes destaquen con resaltadores bonitos y kawaii para estudiar, planear y crear con mucho color.'
    WHEN 'bee4652f-0b37-4e02-85a5-7c187139ee18' THEN 'Descubre blocks de hojas decorativas para journaling, cartas, manualidades y proyectos llenos de creatividad.'
    WHEN 'e6efdedd-ddde-4983-9c67-a329d24e887a' THEN 'Encuentra marcadores bonitos y creativos para escribir, dibujar y convertir tus ideas en proyectos llenos de color.'
    WHEN '66483e2e-7008-4add-9130-202e7a057da1' THEN 'Descubre llaveros kawaii y originales para llevar tus personajes y diseños favoritos contigo o sorprender con un regalo especial.'
  END
WHERE `id` IN (
  '3ff0f1a2-1dea-4170-98cf-2f6fd81da426',
  '31d86a79-b144-4b3c-8c66-757e73d12648',
  '482ba00c-8d43-4b0c-b9f4-5245a5f7f2d9',
  '9dd9ff6f-59d3-4eb4-ab40-61b08cbc4ee8',
  '64bad4ce-04df-455d-8a71-cdfb84caaf5a',
  'bee4652f-0b37-4e02-85a5-7c187139ee18',
  'e6efdedd-ddde-4983-9c67-a329d24e887a',
  '66483e2e-7008-4add-9130-202e7a057da1'
);
