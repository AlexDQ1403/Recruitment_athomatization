import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getCorrelationId } from '../utils/tracing';

const router = Router();

// Supabase admin client (sin autenticación de usuario)
const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * POST /n8n-webhook
 * Recibe candidatos del flujo n8n "Automated_Recruiter webhook"
 *
 * Body esperado:
 * {
 *   "company_id": "uuid-de-empresa",
 *   "IdSolicitud": "string (id de n8n)",
 *   "Nombre": "string",
 *   "Correo Personal": "string (opcional, puede venir vacío)",
 *   "urlLinkedin": "string (opcional, puede venir vacío)",
 *   "Especializacion/descripcion": "string",
 *   "Experiencia": "number (años)",
 *   "Aspiracion": "number (salario esperado)",
 *   "Fecha de busqueda": "ISO string o fecha"
 * }
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const correlationId = getCorrelationId(req);

  try {
    // ========================================
    // 1. Validar que company_id existe en body
    // ========================================
    const companyId = req.body?.company_id;
    if (!companyId) {
      logger.warn('n8n webhook: company_id faltante', { correlationId });
      res.status(400).json({ error: 'company_id es requerido en el body' });
      return;
    }

    // ========================================
    // 2. Validar que la empresa existe
    // ========================================
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      logger.warn('n8n webhook: empresa no encontrada', {
        correlationId,
        companyId,
        error: companyError?.message,
      });
      res.status(404).json({ error: `Empresa ${companyId} no encontrada` });
      return;
    }

    // ========================================
    // 3. Validar campos mínimos requeridos
    // ========================================
    const { IdSolicitud, Nombre } = req.body;
    if (!IdSolicitud || !Nombre) {
      logger.warn('n8n webhook: campos requeridos faltantes', {
        correlationId,
        companyId,
        IdSolicitud,
        Nombre,
      });
      res.status(400).json({ error: 'IdSolicitud y Nombre son requeridos' });
      return;
    }

    // ========================================
    // 4. Construir objeto de candidato
    // ========================================
    const candidateData = {
      company_id: companyId,
      full_name: String(Nombre).trim(),
      email: req.body['Correo Personal']?.trim() || null,
      linkedin_url: req.body.urlLinkedin?.trim() || null,
      position: String(req.body['Especializacion/descripcion'] || '').trim(),
      experience_years: req.body.Experiencia ? parseInt(String(req.body.Experiencia), 10) : null,
      expected_salary: req.body.Aspiracion ? parseInt(String(req.body.Aspiracion), 10) : null,
      location: null, // n8n no trae ubicación
      source: 'scraping',
      status: 'seguimiento',
      n8n_request_id: String(IdSolicitud).trim(),
      n8n_search_date: req.body['Fecha de busqueda'] ? new Date(req.body['Fecha de busqueda']).toISOString() : null,
      phone: null,
      resume_url: null,
      profile_url: null,
      vacancy_id: null,
      created_by: null,
    };

    // ========================================
    // 5. Validar que no exista candidato duplicado
    // ========================================
    // Validar por n8n_request_id (es único por búsqueda)
    const { data: existing } = await supabaseAdmin
      .from('candidates')
      .select('id')
      .eq('n8n_request_id', candidateData.n8n_request_id)
      .eq('company_id', companyId)
      .single();

    if (existing) {
      logger.info('n8n webhook: candidato ya existe, actualizando', {
        correlationId,
        companyId,
        candidateId: existing.id,
      });
      // Actualizar candidato existente
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('candidates')
        .update(candidateData)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) throw updateError;
      res.json({ success: true, action: 'updated', candidate: updated });
      return;
    }

    // ========================================
    // 6. Insertar nuevo candidato
    // ========================================
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('candidates')
      .insert([candidateData])
      .select()
      .single();

    if (insertError) throw insertError;

    logger.info('n8n webhook: candidato insertado', {
      correlationId,
      companyId,
      candidateId: inserted.id,
      candidateName: inserted.full_name,
    });

    res.json({ success: true, action: 'inserted', candidate: inserted });
  } catch (err) {
    logger.error('n8n webhook: error', {
      correlationId,
      error: String(err),
      body: JSON.stringify(req.body).slice(0, 200),
    });
    res.status(500).json({ error: 'Error al procesar webhook de n8n' });
  }
});

export default router;
