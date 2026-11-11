/** Crea tres cuentas de prueba (empresa, reclutador y candidato) ya confirmadas */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now().toString(36);
const DOMAIN = 'example.com';

// Cumple passwordSchema de register.ts: letras y números, mínimo 8
function makePassword(): string {
  return `Qa${randomBytes(6).toString('hex')}9`;
}

const createdUserIds: string[] = [];
let createdCompanyId: string | null = null;

async function createConfirmedUser(email: string, password: string, full_name: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error || !data?.user) throw new Error(`createUser ${email}: ${error?.message}`);
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function main(): Promise<void> {
  const accounts: { rol: string; email: string; password: string }[] = [];

  // Empresa
  const empresaEmail = `qa.empresa.${stamp}@${DOMAIN}`;
  const empresaPassword = makePassword();
  const empresaId = await createConfirmedUser(empresaEmail, empresaPassword, 'Empresa QA');

  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .insert({ name: `Empresa QA ${stamp}`, industry: 'Pruebas' })
    .select('id')
    .single();
  if (companyError || !company) throw new Error(`companies: ${companyError?.message}`);
  createdCompanyId = company.id;

  const { error: empresaProfileError } = await supabaseAdmin.from('profiles').insert({
    id: empresaId,
    email: empresaEmail,
    full_name: 'Empresa QA',
    role: 'empresa',
    company_id: company.id,
  });
  if (empresaProfileError) throw new Error(`profiles empresa: ${empresaProfileError.message}`);
  accounts.push({ rol: 'empresa', email: empresaEmail, password: empresaPassword });

  // Reclutador de esa empresa
  const recruiterEmail = `qa.reclutador.${stamp}@${DOMAIN}`;
  const recruiterPassword = makePassword();
  const recruiterId = await createConfirmedUser(recruiterEmail, recruiterPassword, 'Reclutador QA');

  const { error: recruiterProfileError } = await supabaseAdmin.from('profiles').upsert({
    id: recruiterId,
    email: recruiterEmail,
    full_name: 'Reclutador QA',
    role: 'recruiter',
    company_id: company.id,
  });
  if (recruiterProfileError) throw new Error(`profiles reclutador: ${recruiterProfileError.message}`);
  accounts.push({ rol: 'recruiter', email: recruiterEmail, password: recruiterPassword });

  // Candidato (sin empresa)
  const candidateEmail = `qa.candidato.${stamp}@${DOMAIN}`;
  const candidatePassword = makePassword();
  const candidateId = await createConfirmedUser(candidateEmail, candidatePassword, 'Candidato QA');

  const { error: candidateProfileError } = await supabaseAdmin.from('profiles').insert({
    id: candidateId,
    email: candidateEmail,
    full_name: 'Candidato QA',
    role: 'candidato',
    company_id: null,
  });
  if (candidateProfileError) throw new Error(`profiles candidato: ${candidateProfileError.message}`);

  const { error: fichaError } = await supabaseAdmin.from('candidate_profiles').insert({
    profile_id: candidateId,
    position: 'Desarrollador Full Stack',
    location: 'Bogotá',
    experience_years: 3,
  });
  if (fichaError) throw new Error(`candidate_profiles: ${fichaError.message}`);
  accounts.push({ rol: 'candidato', email: candidateEmail, password: candidatePassword });

  console.log(`Empresa: Empresa QA ${stamp} (${company.id})`);
  console.table(accounts);
}

main().catch(async (err) => {
  console.error(String(err));
  // Rollback manual: profiles y candidate_profiles caen en cascada con el usuario
  for (const id of createdUserIds) await supabaseAdmin.auth.admin.deleteUser(id);
  if (createdCompanyId) await supabaseAdmin.from('companies').delete().eq('id', createdCompanyId);
  process.exit(1);
});
