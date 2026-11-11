'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SemiFigure } from '../landing/SemiFigure';
import landing from '../landing/landing.module.css';
import { UserRole } from '../../types';
import { setMotionPaused, useMotionPausedByUser, useMotionReduced } from '../../lib/motion';

// Semi dentro de la app: un consejo según la cuenta y la página, en una esquina

type Tips = Record<string, string[]>;

const RECRUITER: Tips = {
  '/dashboard': [
    'Aquí ves qué hacer hoy: a quién recontactar, postulaciones sin revisar y lo que la empresa aún no decide.',
    'Usa los filtros de arriba para ver una sola vacante o un origen de candidatos.',
    'En «Candidatos por etapa» encuentras a cada persona y su siguiente paso.',
  ],
  '/chat': [
    'Escribe el perfil como se lo pedirías a un colega: cargo, ciudad, experiencia y salario.',
    'Si en tu base no hay suficientes, los busco en LinkedIn y te aviso aquí mismo.',
    'Desde cada resultado puedes contactar por WhatsApp o correo con un mensaje ya escrito.',
  ],
  '/vacancies': [
    'Crea una vacante describiéndola con tus palabras: la IA llena el formulario y tú revisas.',
    '«Ver postulantes» te muestra quién se postuló y en qué etapa va.',
    'Con «Copiar enlace» compartes la vacante para que los candidatos se postulen.',
  ],
  '/history': ['Aquí quedan tus búsquedas. Con «Ver» vuelves a sus resultados.'],
  '/profile': ['Completa tu cargo y teléfono: así te reconocen los candidatos con los que hablas.'],
};

const COMPANY: Tips = {
  '/dashboard': [
    'Lo más importante está en «Necesitan tu decisión»: autoriza o descarta a quien te presentaron.',
    'Si alguien lleva varios días esperando, decide pronto: los buenos candidatos aceptan otras ofertas.',
    'Más abajo ves tus vacantes y cómo trabaja cada reclutador.',
  ],
  '/candidates': [
    'Abre «Ver perfil» antes de decidir. Al autorizar, verás su teléfono y correo.',
    'Deja un motivo al decidir: tu reclutador lo verá y buscará mejor.',
  ],
  '/recruiters': [
    'Invita a tus reclutadores con su correo: les llega un enlace para crear su contraseña.',
    'Si alguien no ha creado su contraseña verás «Invitación pendiente» y podrás reenviarla.',
  ],
  '/reports': ['Elige el periodo y exporta el reporte en CSV, o imprímelo en PDF para compartirlo.'],
  '/vacancies': [
    'Crea una vacante describiéndola con tus palabras: la IA llena el formulario.',
    '«Ver postulantes» te muestra quién se postuló y quién ya te presentaron.',
  ],
  '/profile': ['Aquí mantienes al día los datos de tu empresa.'],
};

const CANDIDATE: Tips = {
  '/candidate/dashboard': [
    'Este es tu tablero: cuántas postulaciones llevas, cuáles cambiaron y cuáles necesitan seguimiento.',
    'Si una postulación de otro sitio avanza, actualiza su estado en «Mis postulaciones».',
  ],
  '/candidate/profile': [
    'Sube tu hoja de vida y la IA llena tu perfil. Tú revisas todo antes de guardar.',
    'Con tu perfil completo, el porcentaje de cada vacante es más confiable.',
  ],
  '/candidate/applications': [
    'Las vacantes están ordenadas por qué tanto encajan contigo.',
    'Antes de postularte abre «Ver ajuste»: te digo qué ajustar en tu HV para esa vacante.',
    'En «Otros sitios web» hay ofertas de elempleo, Computrabajo y LinkedIn.',
  ],
};

const GENERIC = ['¡Hola! Soy Semi. Si tienes dudas, tócame y te doy un consejo de esta página.'];

const BY_ROLE: Partial<Record<UserRole, Tips>> = { recruiter: RECRUITER, empresa: COMPANY, candidato: CANDIDATE };

const SEEN_KEY = 'kmella-guide-seen';
const HIDDEN_KEY = 'kmella-guide-hidden';

const readSeen = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; }
};

export function AppGuide({ role, pathname }: { role: UserRole; pathname: string }) {
  const tips = useMemo(() => {
    const table = BY_ROLE[role];
    const key = table && Object.keys(table).sort((a, b) => b.length - a.length).find((k) => pathname.startsWith(k));
    return (key && table?.[key]) || GENERIC;
  }, [role, pathname]);

  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [i, setI] = useState(0);
  // Aplica en la app la pausa elegida en la web pública (o aquí mismo)
  useMotionReduced();
  const motionPaused = useMotionPausedByUser();

  // Primera visita a cada página: Semi habla solo; después espera a que lo toquen.
  // El ref evita decidir dos veces la misma página (React repite los efectos en desarrollo)
  const decided = useRef('');
  useEffect(() => {
    const seenKey = `${role}:${pathname}`;
    if (decided.current === seenKey) return;
    decided.current = seenKey;
    setI(0);
    try { setHidden(localStorage.getItem(HIDDEN_KEY) === '1'); } catch { /* sin almacenamiento */ }
    const seen = readSeen();
    if (!seen.includes(seenKey)) {
      setOpen(true);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, seenKey].slice(-50))); } catch { /* sin almacenamiento */ }
    } else {
      setOpen(false);
    }
  }, [role, pathname]);

  const hide = (value: boolean) => {
    setHidden(value);
    setOpen(!value);
    try {
      if (value) localStorage.setItem(HIDDEN_KEY, '1');
      else localStorage.removeItem(HIDDEN_KEY);
    } catch { /* sin almacenamiento */ }
  };

  const raised = pathname.startsWith('/chat');

  if (hidden) {
    return (
      <button type="button" className="app-guide-tab" onClick={() => hide(false)} aria-label="Mostrar a Semi, tu guía">
        <span aria-hidden="true">🐪</span>
      </button>
    );
  }

  return (
    <div className={`app-guide${raised ? ' raised' : ''}`}>
      {open && (
        <div className="app-guide-bubble" role="status" aria-live="polite">
          <button type="button" className="app-guide-close" onClick={() => setOpen(false)} aria-label="Cerrar consejo de Semi">×</button>
          <p className="app-guide-name">Semi</p>
          <p key={i} className="app-guide-text">{tips[i % tips.length]}</p>
          <div className="app-guide-actions">
            {tips.length > 1 && (
              <button type="button" onClick={() => setI((x) => x + 1)}>Otro consejo</button>
            )}
            <button type="button" onClick={() => setOpen(false)}>Entendido</button>
            <button type="button" onClick={() => setMotionPaused(!motionPaused)} aria-pressed={motionPaused}>
              {motionPaused ? 'Reanudar animaciones' : 'Pausar animaciones'}
            </button>
            <button type="button" className="app-guide-hide" onClick={() => hide(true)}>Ocultar a Semi</button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="app-guide-semi"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Ocultar consejo de Semi' : 'Pedir un consejo a Semi'}
        aria-expanded={open}
      >
        {/* landing.mascot da las poses y caras del dibujo; la posición la pone app-guide */}
        <span className={`${landing.mascot} app-guide-figure`} data-pose="chat" data-mood={open ? 'happy' : 'normal'}>
          <SemiFigure />
        </span>
      </button>
    </div>
  );
}
