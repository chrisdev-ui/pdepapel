-- Realinea las vigencias de ofertas y cupones al modelo nuevo (2026-09-11):
-- cada promoción cubre días calendario completos en hora de Colombia
-- (UTC-5, sin horario de verano): empieza a las 05:00:00.000 UTC del primer
-- día y termina a las 04:59:59.999 UTC del día siguiente al último.
--
-- Ofertas: la API guardaba `utcToZonedTime(fecha)`, es decir la fecha restada
-- 5 h por cada guardado. La hora UTC guardada revela cuántas veces se restó
-- (k): 00 -> 1, 19 -> 2, 14 -> 3, 09 -> 4, 04 -> 5. Se suma 5·k horas para
-- recuperar el instante que se eligió y se expande al día completo.
--
-- Cupones: se guardaba el instante tal cual. Los elegidos con el calendario
-- terminan a las 00:00 del último día (05:00 UTC), con lo que ese día quedaba
-- fuera; los creados con fechas "yyyy-mm-dd" quedaron a las 00:00 UTC (19:00
-- del día anterior en Bogotá). Ambos se llevan al día completo que se eligió.
--
-- Solo toca filas cuyo patrón horario es uno de los conocidos; cualquier otra
-- se deja como está y aparece en la consulta de verificación.
--
-- Vista previa (ejecutar antes):
--   SELECT id, name, startDate, endDate,
--     CASE HOUR(startDate) WHEN 0 THEN 1 WHEN 19 THEN 2 WHEN 14 THEN 3 WHEN 9 THEN 4 WHEN 4 THEN 5 WHEN 5 THEN 0 END AS k
--   FROM Offer;
--   SELECT HOUR(startDate) AS hs, HOUR(endDate) AS he, COUNT(*) FROM Coupon GROUP BY hs, he;

-- Ofertas: deshacer los desplazamientos y expandir al día completo.
UPDATE Offer
SET
  startDate = TIMESTAMP(DATE(DATE_ADD(startDate, INTERVAL (5 * (CASE HOUR(startDate) WHEN 0 THEN 1 WHEN 19 THEN 2 WHEN 14 THEN 3 WHEN 9 THEN 4 WHEN 4 THEN 5 END) - 5) HOUR)), '05:00:00.000'),
  endDate   = DATE_SUB(DATE_ADD(TIMESTAMP(DATE(DATE_ADD(endDate, INTERVAL (5 * (CASE HOUR(endDate) WHEN 0 THEN 1 WHEN 19 THEN 2 WHEN 14 THEN 3 WHEN 9 THEN 4 WHEN 4 THEN 5 WHEN 23 THEN 1 WHEN 18 THEN 2 WHEN 13 THEN 3 WHEN 8 THEN 4 WHEN 3 THEN 5 END) - 5) HOUR)), '05:00:00.000'), INTERVAL 1 DAY), INTERVAL 1000 MICROSECOND)
WHERE HOUR(startDate) IN (0, 19, 14, 9, 4)
  AND HOUR(endDate) IN (0, 19, 14, 9, 4, 23, 18, 13, 8, 3);

-- Cupones: el día elegido es la fecha UTC cuando la hora es 00 (creados con
-- "yyyy-mm-dd") y la fecha en Bogotá en los demás casos; luego día completo.
UPDATE Coupon
SET
  startDate = TIMESTAMP(DATE(CASE WHEN HOUR(startDate) = 0 THEN startDate ELSE DATE_SUB(startDate, INTERVAL 5 HOUR) END), '05:00:00.000'),
  endDate   = DATE_SUB(DATE_ADD(TIMESTAMP(DATE(CASE WHEN HOUR(endDate) = 0 THEN endDate ELSE DATE_SUB(endDate, INTERVAL 5 HOUR) END), '05:00:00.000'), INTERVAL 1 DAY), INTERVAL 1000 MICROSECOND)
WHERE NOT (HOUR(startDate) = 5 AND MINUTE(startDate) = 0 AND HOUR(endDate) = 4 AND MINUTE(endDate) = 59);

-- Verificación (después): todas las ofertas y cupones deben quedar con
-- HOUR(startDate) = 5 y HOUR(endDate) = 4.
--   SELECT 'Offer' AS t, COUNT(*) FROM Offer WHERE HOUR(startDate) <> 5 OR HOUR(endDate) <> 4
--   UNION ALL SELECT 'Coupon', COUNT(*) FROM Coupon WHERE HOUR(startDate) <> 5 OR HOUR(endDate) <> 4;
