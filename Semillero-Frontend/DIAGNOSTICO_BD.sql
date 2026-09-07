-- DIAGNÓSTICO: Ver qué tablas existen en la BD
-- Ejecuta este script en Supabase SQL Editor para ver el estado actual

-- ============================================================================
-- PASO 1: Listar todas las tablas en el schema public
-- ============================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================================================
-- PASO 2: Verificar columnas de 'candidates' (si existe)
-- ============================================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'candidates'
ORDER BY ordinal_position;

-- ============================================================================
-- PASO 3: Verificar columnas de 'profiles' (si existe)
-- ============================================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- ============================================================================
-- PASO 4: Ver si existen las tablas nuevas que intentamos crear
-- ============================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('companies', 'chat_sessions', 'chat_messages', 'search_history')
ORDER BY table_name;
