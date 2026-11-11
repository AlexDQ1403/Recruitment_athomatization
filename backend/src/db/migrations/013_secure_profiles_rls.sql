-- MIGRACIÓN 013: Cerrar la escalada de privilegios en profiles
-- Ejecutar DESPUÉS de 012_profiles_suspension.sql
--
-- PROBLEMA QUE RESUELVE (confirmado en producción vía pg_policies):
--
--   profiles_update  UPDATE  {public}  USING (auth.uid() = id)  WITH CHECK: NULL
--   profiles_read    SELECT  {public}  USING (true)
--
-- 1. profiles_update deja al usuario editar su fila entera. RLS filtra FILAS,
--    nunca COLUMNAS, así que cualquiera con la anon key (pública, va en el
--    bundle del navegador) puede ejecutar:
--        update({ role: 'empresa' })        -> se auto-promueve a administrador
--        update({ company_id: '<otra>' })   -> salta a otra empresa y ve sus datos
--        update({ suspended: false })       -> revierte su propia suspensión
--    El salto de tenant es el más grave: TODAS las políticas del sistema
--    resuelven la empresa leyendo esta tabla.
--
-- 2. profiles_read con USING (true) sobre {public} —que incluye anon— publica
--    nombre, email, rol y empresa de todos los usuarios SIN necesidad de login.
--
-- Restringir columnas es imposible solo con RLS: de ahí el trigger del punto 4.

-- ============================================================================
-- 1. Helper para resolver la empresa del usuario SIN recursión de RLS
-- ============================================================================
-- Una política sobre profiles que consulte profiles se auto-invoca y Postgres
-- aborta con "infinite recursion detected in policy". SECURITY DEFINER ejecuta
-- la función con los permisos del creador, saltando RLS y cortando el ciclo.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

-- ============================================================================
-- 2. Detectar si la sesión actual es service_role (el backend)
-- ============================================================================
-- El backend necesita seguir cambiando role/company_id/suspended para el CRUD
-- de reclutadores; los usuarios finales no.
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb->>'role',
    current_setting('request.jwt.claim.role', true),
    ''
  ) = 'service_role';
$$;

-- ============================================================================
-- 3. Políticas de lectura y escritura acotadas
-- ============================================================================
DROP POLICY IF EXISTS profiles_read   ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_delete ON public.profiles;

-- Lectura: la propia fila, o los compañeros de la misma empresa.
-- TO authenticated elimina el acceso anónimo que permitía {public}.
CREATE POLICY profiles_read_scoped ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (
      company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  );

-- Escritura: solo la propia fila, y el resultado debe seguir siendo la propia
-- fila (WITH CHECK explícito, no heredado). Las columnas sensibles las protege
-- el trigger del punto 4.
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Sin políticas de INSERT/DELETE: las altas y bajas pasan por el backend con
-- service_role, que además audita en recruiter_audit_log.

-- ============================================================================
-- 4. Trigger: congelar las columnas de privilegio
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- El backend (service_role) sí puede cambiarlas
  IF public.is_service_role() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'No autorizado: el rol solo puede cambiarlo una empresa desde el panel de administración';
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'No autorizado: la empresa de un perfil no puede modificarse';
  END IF;

  IF NEW.suspended IS DISTINCT FROM OLD.suspended THEN
    RAISE EXCEPTION 'No autorizado: el estado de suspensión solo puede cambiarlo una empresa';
  END IF;

  -- El id nunca cambia, ni siquiera para el backend
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'No autorizado: el id de un perfil es inmutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();

-- ============================================================================
-- 5. companies: cerrar la enumeración (hallazgo H3)
-- ============================================================================
-- USING (true) sobre {public} devolvía el UUID y el nombre de TODAS las
-- empresas, sin login. Ese UUID es justo el insumo que necesita un atacante
-- para inyectar datos por el webhook de n8n, que hoy no valida firma.
DROP POLICY IF EXISTS companies_read ON public.companies;

CREATE POLICY companies_read_own ON public.companies
  FOR SELECT TO authenticated
  USING (id = public.current_company_id());

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('profiles', 'companies')
ORDER BY tablename, cmd;
