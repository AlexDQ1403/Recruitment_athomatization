-- MIGRACIÓN 032: caché de ofertas externas y consumo de SerpApi
--
-- La caché en memoria se perdía cada vez que Render dormía el servicio y cada
-- visita gastaba una búsqueda de SerpApi (plan gratis: 250/mes). Aquí queda el
-- resultado por cargo + ciudad (24 h) y el conteo mensual para no pasarse del
-- plan. Solo los usa el backend (service role): RLS activo y sin políticas.

 