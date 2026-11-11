'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountService, AccountProfile, AccountCompany, UpdateAccountInput, UpdateCompanyInput } from '../../services/accountService';
import { setStoredUser, getStoredUser, ACCOUNT_UPDATED_EVENT } from '../../lib/auth';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';

const ROLE_LABEL: Record<string, string> = {
  empresa: 'Cuenta de empresa',
  recruiter: 'Reclutador',
  superAdmin: 'Super Admin',
};

const notifyShell = (patch: { full_name?: string | null; avatar_url?: string | null }) => {
  const stored = getStoredUser();
  if (stored) setStoredUser({ ...stored, ...(patch.full_name ? { full_name: patch.full_name } : {}), avatar_url: patch.avatar_url ?? stored.avatar_url });
  window.dispatchEvent(new CustomEvent(ACCOUNT_UPDATED_EVENT, { detail: patch }));
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase();

const fmtMonth = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

/** Solo los campos que cambiaron; los vacíos viajan como null para borrar el dato. */
function diff<T extends Record<string, string>>(form: T, original: Record<string, string | null | undefined>) {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(form)) {
    const next = v.trim();
    if (next !== (original[k] ?? '')) out[k] = next === '' ? null : next;
  }
  return out;
}

/** Perfil propio de Empresa/Reclutador */
export const AccountProfileView = () => {
  const toast = useToast();
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => accountService.getProfile(),
  });

  if (error) {
    return <div className="form-error">{error instanceof Error ? error.message : 'No se pudo cargar tu perfil.'}</div>;
  }

  if (isLoading || !profile) {
    return (
      <div className="account-page" aria-busy="true">
        <div className="skeleton" style={{ width: 220, height: 28, marginBottom: 12 }} />
        <div className="skeleton" style={{ width: 160 }} />
      </div>
    );
  }

  const isEmpresa = profile.role === 'empresa';

  return (
    <div className="account-page">
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />

      <ProfileHeader profile={profile} onError={toast.error} onSuccess={toast.success} />

      {isEmpresa && profile.company && (
        <CompanySection company={profile.company} onError={toast.error} onSuccess={toast.success} />
      )}

      <PersonalSection profile={profile} onError={toast.error} onSuccess={toast.success} onInfo={toast.info} />

      {!isEmpresa && profile.company && <CompanyReadOnly company={profile.company} />}
    </div>
  );
};

type Notify = (msg: string) => void;

// ─── Cabecera: foto, nombre y contexto ──────────────────────────────────────

const ProfileHeader = ({ profile, onError, onSuccess }: { profile: AccountProfile; onError: Notify; onSuccess: Notify }) => {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const name = profile.full_name ?? profile.email;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await accountService.uploadAvatar(file);
      queryClient.setQueryData<AccountProfile>(['account-profile'], (prev) => prev && { ...prev, avatar_url: url });
      notifyShell({ avatar_url: url });
      onSuccess('Foto actualizada');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al subir la foto');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const context = [profile.job_title, profile.company?.name].filter(Boolean).join(' en ');

  return (
    <header className="account-header">
      <button
        type="button"
        className="account-avatar"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        aria-label="Cambiar foto de perfil"
        title="PNG, JPG o WEBP, máx 3 MB"
      >
        {profile.avatar_url
          ? <img src={profile.avatar_url} alt="" loading="lazy" decoding="async" />
          : <span>{initials(name)}</span>}
        <span className="account-avatar-hint">{uploading ? 'Subiendo…' : 'Cambiar'}</span>
      </button>
      <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" onChange={handleUpload} hidden />

      <div className="account-header-text">
        <p className="account-eyebrow">{ROLE_LABEL[profile.role] ?? profile.role}</p>
        <h1>{name}</h1>
        <p className="account-meta">
          {context && <span>{context}</span>}
          <span>{profile.email}</span>
          {profile.phone && <span>{profile.phone}</span>}
        </p>
      </div>
    </header>
  );
};

// ─── Bloque de sección: título a la izquierda, campos a la derecha ─────────

const Section = ({ title, description, children, footer }: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => (
  <section className="account-section">
    <div className="account-section-intro">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    <div className="account-section-body">
      {children}
      {footer && <div className="account-section-footer">{footer}</div>}
    </div>
  </section>
);

const Field = ({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) => (
  <label className={`account-field${wide ? ' account-field-wide' : ''}`}>
    <span className="account-field-label">{label}</span>
    {children}
    {hint && <span className="account-field-hint">{hint}</span>}
  </label>
);

const SaveBar = ({ dirty, saving, onReset, onSave }: { dirty: boolean; saving: boolean; onReset: () => void; onSave: () => void }) => (
  <>
    <span className="account-dirty" aria-live="polite">{dirty ? 'Cambios sin guardar' : ''}</span>
    <button type="button" className="btn-secondary-sm" onClick={onReset} disabled={!dirty || saving}>Descartar</button>
    <button type="button" className="btn-save" onClick={onSave} disabled={!dirty || saving}>
      {saving ? 'Guardando…' : 'Guardar'}
    </button>
  </>
);

// ─── Datos personales ───────────────────────────────────────────────────────

type PersonalForm = { full_name: string; job_title: string; phone: string; email: string };

const toPersonalForm = (p: AccountProfile): PersonalForm => ({
  full_name: p.full_name ?? '',
  job_title: p.job_title ?? '',
  phone: p.phone ?? '',
  email: p.email,
});

const PersonalSection = ({ profile, onError, onSuccess, onInfo }: { profile: AccountProfile; onError: Notify; onSuccess: Notify; onInfo: Notify }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PersonalForm>(() => toPersonalForm(profile));
  const canEditEmail = profile.role !== 'recruiter';

  // Solo se reinicia si cambian estos datos (no al subir una foto a mitad de edición)
  const savedKey = JSON.stringify(toPersonalForm(profile));
  useEffect(() => { setForm(JSON.parse(savedKey)); }, [savedKey]);

  const changes = diff(canEditEmail ? form : { ...form, email: profile.email }, toPersonalForm(profile));
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: (input: UpdateAccountInput) => accountService.updateProfile(input),
    onSuccess: (updated) => {
      queryClient.setQueryData<AccountProfile>(['account-profile'], (prev) => prev && { ...prev, ...updated, email: updated.email ?? prev.email });
      notifyShell({ full_name: updated.full_name });
      onSuccess('Datos guardados');
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Error al guardar'),
  });

  const set = (k: keyof PersonalForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.full_name.trim()) { onError('El nombre no puede quedar vacío'); return; }
    if (!dirty) { onInfo('No hay cambios que guardar'); return; }
    save.mutate(changes as UpdateAccountInput);
  };

  return (
    <Section
      title="Tus datos"
      description={profile.role === 'recruiter'
        ? 'Así te ven la empresa y los candidatos con los que hablas.'
        : 'La persona responsable de esta cuenta.'}
      footer={<SaveBar dirty={dirty} saving={save.isPending} onReset={() => setForm(toPersonalForm(profile))} onSave={submit} />}
    >
      <div className="account-grid">
        <Field label="Nombre completo">
          <input value={form.full_name} onChange={set('full_name')} autoComplete="name" maxLength={160} />
        </Field>
        <Field label="Cargo">
          <input value={form.job_title} onChange={set('job_title')} placeholder="Ej. Analista de selección" autoComplete="organization-title" maxLength={120} />
        </Field>
        <Field label="Teléfono">
          <input value={form.phone} onChange={set('phone')} type="tel" placeholder="+57 300 000 0000" autoComplete="tel" maxLength={30} />
        </Field>
        <Field
          label="Correo"
          hint={canEditEmail ? 'También es tu usuario para iniciar sesión.' : `Es tu usuario de acceso; lo cambia ${profile.company?.name ?? 'tu empresa'}.`}
        >
          <input value={form.email} onChange={set('email')} type="email" autoComplete="email" readOnly={!canEditEmail} aria-readonly={!canEditEmail} />
        </Field>
      </div>
    </Section>
  );
};

// ─── Ficha de la empresa (editable por la empresa) ─────────────────────────

type CompanyForm = { name: string; industry: string; city: string; website: string; description: string };

const toCompanyForm = (c: AccountCompany): CompanyForm => ({
  name: c.name,
  industry: c.industry ?? '',
  city: c.city ?? '',
  website: c.website ?? '',
  description: c.description ?? '',
});

const CompanyFacts = ({ company, links }: { company: AccountCompany; links: boolean }) => (
  <dl className="account-facts">
    <div>
      <dt>Reclutadores</dt>
      <dd>{links ? <Link href="/recruiters">{company.recruiters_count}</Link> : company.recruiters_count}</dd>
    </div>
    <div>
      <dt>Vacantes activas</dt>
      <dd><Link href="/vacancies">{company.active_vacancies}</Link></dd>
    </div>
    <div>
      <dt>En Kmella desde</dt>
      <dd>{fmtMonth(company.created_at)}</dd>
    </div>
  </dl>
);

const CompanySection = ({ company, onError, onSuccess }: { company: AccountCompany; onError: Notify; onSuccess: Notify }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanyForm>(() => toCompanyForm(company));

  const savedKey = JSON.stringify(toCompanyForm(company));
  useEffect(() => { setForm(JSON.parse(savedKey)); }, [savedKey]);

  const changes = diff(form, toCompanyForm(company));
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: (input: UpdateCompanyInput) => accountService.updateCompany(input),
    onSuccess: (updated) => {
      queryClient.setQueryData<AccountProfile>(['account-profile'], (prev) => prev && { ...prev, company: updated });
      onSuccess('Datos de la empresa guardados');
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Error al guardar'),
  });

  const set = (k: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (form.name.trim().length < 2) { onError('El nombre de la empresa es obligatorio'); return; }
    save.mutate(changes as UpdateCompanyInput);
  };

  return (
    <Section
      title="Empresa"
      description="Lo que ven tus reclutadores y los candidatos en cada vacante publicada."
      footer={<SaveBar dirty={dirty} saving={save.isPending} onReset={() => setForm(toCompanyForm(company))} onSave={submit} />}
    >
      <CompanyFacts company={company} links />
      <div className="account-grid">
        <Field label="Razón social o nombre comercial">
          <input value={form.name} onChange={set('name')} autoComplete="organization" maxLength={120} />
        </Field>
        <Field label="Sector">
          <input value={form.industry} onChange={set('industry')} placeholder="Ej. Tecnología, Salud, Logística" maxLength={80} />
        </Field>
        <Field label="Ciudad">
          <input value={form.city} onChange={set('city')} placeholder="Ej. Bogotá" autoComplete="address-level2" maxLength={80} />
        </Field>
        <Field label="Sitio web">
          <input value={form.website} onChange={set('website')} type="url" placeholder="https://" autoComplete="url" maxLength={255} />
        </Field>
        <Field label="Sobre la empresa" hint={`${form.description.length}/1000`} wide>
          <textarea
            value={form.description}
            onChange={set('description')}
            rows={4}
            maxLength={1000}
            placeholder="A qué se dedican, cómo trabajan, qué tipo de perfiles buscan."
          />
        </Field>
      </div>
    </Section>
  );
};

// ─── Empresa del reclutador (solo lectura) ─────────────────────────────────

const CompanyReadOnly = ({ company }: { company: AccountCompany }) => (
  <Section title="Tu empresa" description="Estos datos los mantiene la cuenta de empresa.">
    <div className="account-company-card">
      <p className="account-company-name">{company.name}</p>
      <p className="account-company-meta">
        {[company.industry, company.city].filter(Boolean).join(' · ') || 'Sin sector ni ciudad registrados'}
        {company.website && (
          <> · <a href={company.website} target="_blank" rel="noopener noreferrer">{company.website.replace(/^https?:\/\//, '')}</a></>
        )}
      </p>
      {company.description && <p className="account-company-desc">{company.description}</p>}
    </div>
    <CompanyFacts company={company} links={false} />
  </Section>
);
