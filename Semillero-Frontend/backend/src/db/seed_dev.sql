-- SEED DE DESARROLLO
-- Ejecutar DESPUÉS de las migraciones 006 → 012
--
-- Deja el entorno listo para probar el flujo completo:
--   1. Una empresa
--   2. Un profile por cada usuario de auth.users (el más antiguo como 'empresa')
--   3. Candidatos de prueba repartidos entre los tres estados
--
-- Es idempotente: se puede volver a ejecutar sin duplicar nada.

-- ============================================================================
-- 1. EMPRESA
-- ============================================================================
INSERT INTO public.companies (name, industry)
VALUES ('Semillero Demo', 'Tecnología')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. PERFILES
-- El usuario más antiguo de auth.users queda como 'empresa' (administra el
-- resto); los demás como 'recruiter'. Todos bajo la misma empresa.
-- ============================================================================
INSERT INTO public.profiles (id, email, full_name, role, company_id)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  CASE
    WHEN u.id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
      THEN 'empresa'
    ELSE 'recruiter'
  END,
  (SELECT id FROM public.companies WHERE name = 'Semillero Demo')
FROM auth.users u
ON CONFLICT (id) DO UPDATE
  SET company_id = EXCLUDED.company_id,
      role       = COALESCE(public.profiles.role, EXCLUDED.role);

-- Garantiza que exista al menos un 'empresa' aunque los profiles ya existieran
UPDATE public.profiles
SET role = 'empresa'
WHERE id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'empresa');

-- ============================================================================
-- 3. CANDIDATOS DE PRUEBA
-- 'en_contacto' se omite a propósito: conviene alcanzarlo desde la UI para
-- comprobar que la transición dispara el webhook de entrevista.
-- ============================================================================
INSERT INTO public.candidates
  (full_name, position, email, phone, experience_years, expected_salary,
   location, status, source, company_id)
SELECT * FROM (VALUES
  ('Ana Restrepo',    'Desarrolladora Backend',  'ana.restrepo@example.com',    '+57 300 111 2233', 5, 8500000,  'Medellín',   'seguimiento', 'internal'),
  ('Carlos Mejía',    'Desarrollador Frontend',  'carlos.mejia@example.com',    '+57 301 222 3344', 3, 6500000,  'Bogotá',     'seguimiento', 'scraping'),
  ('Laura Gómez',     'Diseñadora UX/UI',        'laura.gomez@example.com',     '+57 302 333 4455', 4, 7000000,  'Cali',       'seguimiento', 'applicant'),
  ('Diego Torres',    'DevOps Engineer',         'diego.torres@example.com',    '+57 303 444 5566', 6, 9500000,  'Bogotá',     'seguimiento', 'scraping'),
  ('Valentina Ruiz',  'Data Analyst',            'valentina.ruiz@example.com',  '+57 304 555 6677', 2, 5500000,  'Barranquilla','seguimiento','internal'),
  ('Andrés Cardona',  'Tech Lead',               'andres.cardona@example.com',  '+57 305 666 7788', 8, 13000000, 'Medellín',   'seguimiento', 'internal'),
  ('Sofía Pérez',     'QA Automation',           'sofia.perez@example.com',     '+57 306 777 8899', 4, 6800000,  'Remoto',     'rechazado',   'scraping'),
  ('Julián Ospina',   'Desarrollador Fullstack', 'julian.ospina@example.com',   '+57 307 888 9900', 1, 4200000,  'Pereira',    'rechazado',   'applicant')
) AS v(full_name, position, email, phone, experience_years, expected_salary, location, status, source)
CROSS JOIN (SELECT id AS cid FROM public.companies WHERE name = 'Semillero Demo') c
WHERE NOT EXISTS (
  SELECT 1 FROM public.candidates ex WHERE ex.email = v.email
);

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
SELECT p.email, p.role, c.name AS empresa, p.suspended
FROM public.profiles p
LEFT JOIN public.companies c ON c.id = p.company_id;

SELECT status, count(*) FROM public.candidates GROUP BY status;
