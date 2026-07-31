UPDATE `Category`
SET `imageUrl` = CASE `slug`
  WHEN 'agendas' THEN 'https://res.cloudinary.com/dsogxa0hj/image/upload/v1785470455/category-covers/agendas-20260730.png'
  WHEN 'blocks-de-hojas-decorativas' THEN 'https://res.cloudinary.com/dsogxa0hj/image/upload/v1785470456/category-covers/blocks-de-hojas-decorativas-20260730.png'
  WHEN 'boligrafos-lapiceros' THEN 'https://res.cloudinary.com/dsogxa0hj/image/upload/v1785470457/category-covers/boligrafos-lapiceros-20260730.png'
  WHEN 'llaveros' THEN 'https://res.cloudinary.com/dsogxa0hj/image/upload/v1785470458/category-covers/llaveros-20260730.png'
  WHEN 'marcadores' THEN 'https://res.cloudinary.com/dsogxa0hj/image/upload/v1785470459/category-covers/marcadores-20260730.png'
  WHEN 'notas-adhesivas' THEN 'https://res.cloudinary.com/dsogxa0hj/image/upload/v1785470460/category-covers/notas-adhesivas-20260730.png'
  WHEN 'resaltadores' THEN 'https://res.cloudinary.com/dsogxa0hj/image/upload/v1785470461/category-covers/resaltadores-20260730.png'
  WHEN 'stickers' THEN 'https://res.cloudinary.com/dsogxa0hj/image/upload/v1785470462/category-covers/stickers-20260730.png'
END
WHERE `storeId` = 'f23ee5bc-1f6f-4c10-9872-9e6217cc17fd'
  AND `slug` IN (
    'agendas',
    'blocks-de-hojas-decorativas',
    'boligrafos-lapiceros',
    'llaveros',
    'marcadores',
    'notas-adhesivas',
    'resaltadores',
    'stickers'
  );
