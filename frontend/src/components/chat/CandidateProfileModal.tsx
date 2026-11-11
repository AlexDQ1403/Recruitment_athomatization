'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Candidate, CandidateProfileDetail, ContactChannel, SOURCE_LABELS } from '../../types';
import { candidateProfileService } from '../../services/candidateProfileService';
import { buildContactMessage, formatPhone, mailtoUrl, whatsappUrl } from '../../lib/contact';
import { Icon } from '../ui/Icon';
import { AffinityBadge } from './AffinityBadge';

export type ProfileTab = 'perfil' | 'contactar';

interface Props {
  /** Captura del candidato en el mensaje del chat: se muestra mientras carga el perfil. */
  candidate: Candidate;
  initialTab?: ProfileTab;
  onClose: () => void;
  onContacted?: (candidateId: string, contact: { channel: ContactChannel; created_at: string }) => void;
  onRejectionUndone?: (candidateId: string) => void;
  /** Vista de la empresa: solo lectura, sin contactar ni rechazos internos del reclutador. */
  readOnly?: boolean;
}

const DECISION_TEXT: Record<string, string> = {
  pendiente: 'Pendiente de tu decisión',
  contratado: 'Autorizado para la siguiente fase',
  descartado: 'Descartado',
};

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Correo',
  linkedin: 'LinkedIn',
};

const money = (n: number) => `$${n.toLocaleString('es-CO')}`;
const years = (n: number) => `${n} ${n === 1 ? 'año' : 'años'}`;
const monthYear = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }) : null;
const when = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase();

/** Primer canal con datos, en orden de preferencia. */
const defaultChannel = (p: CandidateProfileDetail): ContactChannel | null =>
  p.contact.phone ? 'whatsapp' : p.contact.email ? 'email' : p.contact.linkedin_url ? 'linkedin' : null;

export const CandidateProfileModal = ({ candidate, initialTab = 'perfil', onClose, onContacted, onRejectionUndone, readOnly = false }: Props) => {
  const [tab, setTab] = useState<ProfileTab>(readOnly ? 'perfil' : initialTab);
  const [profile, setProfile] = useState<CandidateProfileDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ContactChannel | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  // Canal que se abrió y aún no se confirma: solo cuenta como contacto si el reclutador dice que lo envió
  const [awaitingConfirm, setAwaitingConfirm] = useState<ContactChannel | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    candidateProfileService
      .get(candidate.kind ?? 'auto', candidate.id)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setChannel(defaultChannel(p));
        const draft = buildContactMessage({
          fullName: p.full_name,
          role: p.position || p.headline,
          location: p.location,
          recruiterName: p.sender.recruiter_name,
          companyName: p.sender.company_name,
          foundOnline: p.kind === 'legacy' && p.source === 'scraping',
        });
        setSubject(draft.subject);
        setMessage(draft.body);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'No se pudo cargar el perfil'));
    return () => { cancelled = true; };
  }, [candidate.id, candidate.kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = profile?.headline || profile?.position || candidate.headline || candidate.position;
  const facts = useMemo(() => {
    const p = profile ?? candidate;
    return [
      p.location,
      p.experience_years ? `${years(Number(p.experience_years))} de experiencia` : null,
      p.expected_salary ? `aspira a ${money(Number(p.expected_salary))}` : null,
    ].filter(Boolean) as string[];
  }, [profile, candidate]);

  const registerContact = (used: ContactChannel) => {
    if (!profile) return;
    candidateProfileService
      .logContact(profile.kind, profile.id, used)
      .then((contact) => {
        setProfile((prev) => (prev ? { ...prev, last_contact: contact } : prev));
        onContacted?.(candidate.id, contact);
      })
      .catch(() => null); // el registro no debe impedir el contacto
  };

  const undoRejection = async (rejectionId: string) => {
    if (!profile) return;
    try {
      await candidateProfileService.undoReject(profile.kind, profile.id, rejectionId);
      setProfile((prev) => (prev ? { ...prev, rejections: prev.rejections.filter((r) => r.id !== rejectionId) } : prev));
      onRejectionUndone?.(candidate.id);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo deshacer el rechazo');
    }
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const contactHref = (() => {
    if (!profile || !channel) return null;
    if (channel === 'whatsapp' && profile.contact.phone) return whatsappUrl(profile.contact.phone, message);
    if (channel === 'email' && profile.contact.email) return mailtoUrl(profile.contact.email, subject, message);
    if (channel === 'linkedin' && profile.contact.linkedin_url) return profile.contact.linkedin_url;
    return null;
  })();

  const isScraped = profile?.kind === 'legacy' && profile.source === 'scraping';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal cp"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cp-name"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cp-head">
          <span className="cp-avatar" aria-hidden="true">{initials(candidate.full_name)}</span>
          <div className="cp-id">
            <h2 id="cp-name">{profile?.full_name ?? candidate.full_name}</h2>
            {title && <p className="cp-title">{title}</p>}
            {facts.length > 0 && <p className="cp-facts">{facts.join(' · ')}</p>}
            {typeof candidate.affinity === 'number' && (
              <AffinityBadge score={candidate.affinity} parts={candidate.affinity_parts} />
            )}
          </div>
          {(profile?.source ?? candidate.source) && (
            <span className="result-source">{SOURCE_LABELS[profile?.source ?? candidate.source] ?? profile?.source ?? candidate.source}</span>
          )}
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={16} />
          </button>
        </header>

        {!readOnly && <div className="cp-tabs" role="tablist">
          {(['perfil', 'contactar'] as ProfileTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`cp-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'perfil' ? 'Perfil' : 'Contactar'}
            </button>
          ))}
        </div>}

        {error ? (
          <p className="cp-error" role="alert">{error}</p>
        ) : !profile ? (
          <div className="cp-body" aria-busy="true">
            {[80, 100, 60].map((w) => <div key={w} className="skeleton" style={{ height: 14, width: `${w}%`, margin: '10px 0' }} />)}
          </div>
        ) : tab === 'perfil' ? (
          <div className="cp-body">
            {readOnly && profile.presentation && (
              <section className="cp-section cp-presentation" aria-label="Presentación">
                <h3>Cómo llegó a ti</h3>
                <dl className="cp-contact">
                  <dt>Presentado por</dt>
                  <dd>{profile.presentation.presented_by ?? <span className="cp-missing">—</span>}</dd>
                  <dt>Fecha</dt>
                  <dd>{profile.presentation.presented_at ? when(profile.presentation.presented_at) : <span className="cp-missing">—</span>}</dd>
                  <dt>Vacante</dt>
                  <dd>{profile.presentation.vacancy_title ?? <span className="cp-missing">Sin vacante</span>}</dd>
                  <dt>Decisión</dt>
                  <dd>
                    {DECISION_TEXT[profile.presentation.company_decision ?? 'pendiente']}
                    {profile.presentation.decision_reason && <> · «{profile.presentation.decision_reason}»</>}
                  </dd>
                </dl>
              </section>
            )}

            {profile.summary && (
              <section className="cp-section">
                <h3>{isScraped ? 'Extracto público de LinkedIn' : 'Acerca de'}</h3>
                <p className="cp-summary">{profile.summary}</p>
              </section>
            )}

            {profile.experience.length > 0 && (
              <section className="cp-section">
                <h3>Experiencia</h3>
                <ol className="cp-timeline">
                  {profile.experience.map((e, i) => (
                    <li key={i}>
                      <p className="cp-item-title">{e.role_title}</p>
                      <p className="cp-item-sub">
                        {e.company_name} · {monthYear(e.start_date)} – {monthYear(e.end_date) ?? 'actual'}
                      </p>
                      {e.description && <p className="cp-item-text">{e.description}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {profile.education.length > 0 && (
              <section className="cp-section">
                <h3>Formación</h3>
                <ol className="cp-timeline">
                  {profile.education.map((e, i) => (
                    <li key={i}>
                      <p className="cp-item-title">{e.degree}</p>
                      <p className="cp-item-sub">
                        {e.institution}{e.end_date ? ` · ${monthYear(e.end_date)}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {profile.skills.length > 0 && (
              <section className="cp-section">
                <h3>Habilidades</h3>
                <ul className="cp-skills">
                  {profile.skills.map((s) => <li key={s.name}>{s.name}</li>)}
                </ul>
              </section>
            )}

            {!readOnly && profile.rejections.length > 0 && (
              <section className="cp-section">
                <h3>Rechazado para</h3>
                <ul className="cp-rejections">
                  {profile.rejections.map((r) => (
                    <li key={r.id}>
                      <div>
                        <p className="cp-item-title">{r.role_label}</p>
                        <p className="cp-item-sub">{when(r.created_at)}{r.reason ? ` · ${r.reason}` : ''}</p>
                      </div>
                      <button type="button" className="btn-secondary-sm" onClick={() => undoRejection(r.id)}>
                        Deshacer
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="cp-item-sub">Sigue disponible para otros puestos.</p>
                {actionError && <p className="cp-error-inline" role="alert">{actionError}</p>}
              </section>
            )}

            {isScraped && profile.experience.length === 0 && (
              <p className="cp-note">
                Perfil encontrado en una búsqueda externa: solo tenemos lo que LinkedIn muestra públicamente.
                Ábrelo en LinkedIn para ver su trayectoria completa.
              </p>
            )}

            <section className="cp-section">
              <h3>Datos de contacto</h3>
              <dl className="cp-contact">
                <dt>Teléfono</dt>
                <dd>{profile.contact.phone ? formatPhone(profile.contact.phone) : <span className="cp-missing">No disponible</span>}</dd>
                <dt>Correo</dt>
                <dd>{profile.contact.email ?? <span className="cp-missing">No disponible</span>}</dd>
              </dl>
              {readOnly && !profile.contact.phone && !profile.contact.email && profile.presentation?.company_decision !== 'contratado' && (
                <p className="cp-item-sub">El teléfono y el correo se muestran cuando lo autorizas para la siguiente fase.</p>
              )}
              <div className="cp-links">
                {profile.contact.linkedin_url && (
                  <a href={profile.contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="result-link">
                    Abrir perfil en LinkedIn
                  </a>
                )}
                {profile.resume_url && (
                  <a href={profile.resume_url} target="_blank" rel="noopener noreferrer" className="result-link">
                    Ver hoja de vida
                  </a>
                )}
              </div>
            </section>

            {!readOnly && (
              <div className="cp-actions">
                <button type="button" className="btn-save" onClick={() => setTab('contactar')}>
                  Contactar
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="cp-body">
            {!defaultChannel(profile) ? (
              <p className="cp-note">
                No tenemos teléfono, correo ni LinkedIn de este candidato. Puedes copiar el mensaje y usarlo por otro medio.
              </p>
            ) : (
              <div className="cp-channels" role="radiogroup" aria-label="Canal de contacto">
                {(['whatsapp', 'email', 'linkedin'] as ContactChannel[]).map((ch) => {
                  const available = ch === 'whatsapp' ? !!profile.contact.phone
                    : ch === 'email' ? !!profile.contact.email
                    : !!profile.contact.linkedin_url;
                  return (
                    <button
                      key={ch}
                      type="button"
                      role="radio"
                      aria-checked={channel === ch}
                      className={`cp-channel${channel === ch ? ' active' : ''}`}
                      onClick={() => setChannel(ch)}
                      disabled={!available}
                      title={available ? undefined : `Sin ${ch === 'whatsapp' ? 'teléfono' : ch === 'email' ? 'correo' : 'perfil de LinkedIn'}`}
                    >
                      {ch === 'whatsapp' && <Icon name="phone" size={14} />}
                      {ch === 'email' && <Icon name="mail" size={14} />}
                      {CHANNEL_LABELS[ch]}
                    </button>
                  );
                })}
              </div>
            )}

            {channel === 'email' && (
              <label className="cp-field">
                <span>Asunto</span>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
              </label>
            )}
            <label className="cp-field">
              <span>Mensaje {channel === 'linkedin' && '(se copia para pegarlo en LinkedIn)'}</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} maxLength={2000} />
            </label>

            {awaitingConfirm && (
              <div className="cp-confirm" role="alertdialog" aria-label="Confirmar envío">
                <p>¿Le enviaste el mensaje por {CHANNEL_LABELS[awaitingConfirm]}?</p>
                <div>
                  <button type="button" className="btn-save" onClick={() => { registerContact(awaitingConfirm); setAwaitingConfirm(null); }}>
                    Sí, lo envié
                  </button>
                  <button type="button" className="btn-secondary-sm" onClick={() => setAwaitingConfirm(null)}>
                    No todavía
                  </button>
                </div>
              </div>
            )}

            {profile.last_contact && (
              <p className="cp-last">
                <Icon name="check" size={13} /> Último contacto: {CHANNEL_LABELS[profile.last_contact.channel]} · {when(profile.last_contact.created_at)}
              </p>
            )}

            <div className="cp-actions">
              <button type="button" className="btn-secondary-sm" onClick={copyMessage}>
                <Icon name="clipboard" size={13} /> {copied ? 'Copiado' : 'Copiar mensaje'}
              </button>
              {contactHref && channel && (
                <a
                  href={contactHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn-save cp-send${channel === 'whatsapp' ? ' whatsapp' : ''}`}
                  onClick={() => {
                    if (channel === 'linkedin') copyMessage();
                    // Abrir WhatsApp/correo/LinkedIn no es haber escrito: se pregunta al volver
                    setAwaitingConfirm(channel);
                  }}
                >
                  {channel === 'whatsapp' ? 'Abrir WhatsApp' : channel === 'email' ? 'Abrir correo' : 'Copiar y abrir LinkedIn'}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
