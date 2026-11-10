'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatePortalService, CvDraft, MyProfile } from '../../services/candidatePortalService';
import { ConfirmModal } from '../ui/ConfirmModal';
import { CvReviewModal } from './CvReviewModal';

/**
 * Punto de partida del perfil: el candidato sube su hoja de vida, la IA la lee y
 * prellena el perfil, y él revisa y corrige antes de guardar (CvReviewModal).
 * Con el perfil completo, las vacantes recomendadas y su porcentaje son confiables.
 */
export const CvImport = ({ profile, onMessage }: {
  profile: MyProfile;
  onMessage: (kind: 'success' | 'error', text: string) => void;
}) => {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<CvDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const extract = useMutation({
    mutationFn: () => candidatePortalService.extractCv(),
    onSuccess: (d) => setDraft(d),
    onError: (err) => onMessage('error', err instanceof Error ? err.message : 'No pudimos leer tu hoja de vida'),
  });

  const upload = useMutation({
    mutationFn: (file: File) => candidatePortalService.uploadCv(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      extract.mutate();
    },
    onError: (err) => onMessage('error', err instanceof Error ? err.message : 'Error al subir la hoja de vida'),
  });

  const remove = useMutation({
    mutationFn: () => candidatePortalService.deleteCv(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      setConfirmDelete(false);
      onMessage('success', 'Hoja de vida eliminada');
    },
    onError: (err) => onMessage('error', err instanceof Error ? err.message : 'Error al eliminar la hoja de vida'),
  });

  const busy = upload.isPending || extract.isPending;

  return (
    <section className="cv-import" aria-labelledby="cv-import-title">
      {confirmDelete && (
        <ConfirmModal
          message="¿Eliminar tu hoja de vida actual? Los reclutadores ya no podrán abrirla. Tu perfil no cambia."
          confirmLabel={remove.isPending ? 'Eliminando...' : 'Eliminar'}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {draft && (
        <CvReviewModal
          draft={draft}
          profile={profile}
          onClose={() => setDraft(null)}
          onSaved={(summary) => {
            setDraft(null);
            onMessage('success', summary);
          }}
        />
      )}

      <div>
        <h2 id="cv-import-title">{profile.cv_url ? 'Tu hoja de vida' : 'Empieza por tu hoja de vida'}</h2>
        <p>
          {profile.cv_url
            ? 'Si la actualizas, súbela de nuevo: la IA vuelve a leerla y tú decides qué cambia en tu perfil.'
            : 'Súbela y la IA llena tu perfil por ti. Tú revisas y corriges antes de guardar. Con tu perfil completo te mostramos las vacantes que más se ajustan.'}
        </p>
        {busy && (
          <p className="cv-import-status" role="status">
            {upload.isPending ? 'Subiendo tu hoja de vida…' : 'Leyendo tu hoja de vida con IA… (puede tardar unos segundos)'}
          </p>
        )}
      </div>

      <div className="cv-import-actions">
        <button type="button" className="btn-save" onClick={() => fileRef.current?.click()} disabled={busy}>
          {profile.cv_url ? 'Subir versión nueva' : 'Subir mi hoja de vida'}
        </button>
        {profile.cv_url && (
          <>
            <button type="button" className="btn-secondary-sm" onClick={() => extract.mutate()} disabled={busy}>
              Llenar mi perfil con la HV actual
            </button>
            <a href={profile.cv_url} target="_blank" rel="noopener noreferrer" className="result-link">Ver HV actual</a>
            <button type="button" className="result-link cv-import-delete" onClick={() => setConfirmDelete(true)} disabled={busy}>Eliminar</button>
          </>
        )}
        <span className="cv-import-hint">PDF o DOCX · máx. 5 MB</span>
        {profile.cv_url && <Link href="/candidate/applications" className="result-link">Ver vacantes recomendadas</Link>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx"
        hidden
        aria-label="Archivo de hoja de vida"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = '';
        }}
      />
    </section>
  );
};
