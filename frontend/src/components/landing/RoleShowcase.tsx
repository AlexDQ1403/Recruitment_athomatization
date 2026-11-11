import { CSSProperties } from 'react';
import { Reveal } from './Reveal';
import styles from './landing.module.css';

// Los tres roles de Kmella, cada uno con una pieza de lo que hace en la app:
// la empresa arma su equipo de reclutadores, el reclutador busca con el chat
// y el candidato sube su hoja de vida para ver las vacantes que más le encajan.
// Datos de ejemplo; los enlaces para registrarse viven solo en la sección de cierre.

const RECRUITERS = [
  { i: 'MP', c: '#3d5ba8', name: 'María Paula Rojas', area: 'Tecnología' },
  { i: 'JD', c: '#c81b1d', name: 'Juan David Ortiz', area: 'Operaciones' },
  { i: 'VC', c: '#7b2f4f', name: 'Valentina Cruz', area: 'Comercial' },
];

const RESULTS = [
  { i: 'LG', c: '#3d5ba8', name: 'Laura Gómez', note: '4 años · Figma, research' },
  { i: 'SM', c: '#2c4d99', name: 'Sebastián Mejía', note: '3 años · Figma, prototipado' },
];

const SKILLS = ['SQL', 'Python', 'Power BI'];

const VACANCIES = [
  { title: 'Analista de datos', where: 'Medellín · Híbrido', fit: 0.92 },
  { title: 'Analista de BI', where: 'Remoto', fit: 0.78 },
  { title: 'Científica de datos jr.', where: 'Bogotá', fit: 0.61 },
];

const Avatar = ({ i, c }: { i: string; c: string }) => (
  <span className={styles.mockAvatar} style={{ '--c': c } as CSSProperties}>{i}</span>
);

export function RoleShowcase() {
  return (
    <div className={styles.showcase}>
      {/* ─── Empresa: crea y gestiona a sus reclutadores ─── */}
      <Reveal className={styles.showcaseCol}>
        <h3 className={styles.headingSm}>La empresa</h3>
        <p className={styles.bodyMuted}>
          Crea la cuenta de tu empresa, invita a tus reclutadores y sigue cómo
          avanza la contratación desde el dashboard y los reportes.
        </p>
        <div className={styles.mock} aria-hidden="true">
          <div className={styles.mockHead}>
            <div>
              <p className={styles.mockTitle}>Tu equipo</p>
              <p className={styles.mockMeta}>Café Montaña S.A.S.</p>
            </div>
            <span className={styles.mockAction}>Gestionar reclutadores</span>
          </div>
          <ul className={styles.mockList}>
            {RECRUITERS.map((r) => (
              <li key={r.i}>
                <Avatar i={r.i} c={r.c} />
                <div>
                  <p>{r.name}</p>
                  <small>{r.area}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      {/* ─── Reclutador: busca candidatos con el chat ─── */}
      <Reveal delay={100} className={styles.showcaseCol}>
        <h3 className={styles.headingSm}>El reclutador</h3>
        <p className={styles.bodyMuted}>
          Publica vacantes, busca candidatos escribiendo lo que necesita y mueve
          a cada persona por las etapas del proceso.
        </p>
        <div className={styles.mock} aria-hidden="true">
          <p className={styles.mockQuery}>Diseñadora UX en Cali que maneje Figma</p>
          <p className={styles.mockMeta}>Encontré 2 perfiles que encajan</p>
          <ul className={styles.mockList}>
            {RESULTS.map((r) => (
              <li key={r.i}>
                <Avatar i={r.i} c={r.c} />
                <div>
                  <p>{r.name}</p>
                  <small>{r.note}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      {/* ─── Candidato: sube la HV y ve las vacantes que mejor le encajan ─── */}
      <Reveal delay={200} className={styles.showcaseCol}>
        <h3 className={styles.headingSm}>El candidato</h3>
        <p className={styles.bodyMuted}>
          Sube tu hoja de vida y Kmella te muestra primero las vacantes que más
          se ajustan a lo que sabes hacer. Te postulas desde ahí.
        </p>
        <div className={styles.mock} aria-hidden="true">
          <div className={styles.mockFile}>
            <span className={styles.mockFileIcon}>PDF</span>
            <div>
              <p>HV_Andrea_Lopez.pdf</p>
              <small>Leída · Analista de datos, 3 años</small>
            </div>
          </div>
          <div className={styles.mockSkills}>
            {SKILLS.map((s) => <span key={s}>{s}</span>)}
          </div>
          <p className={styles.mockSub}>Vacantes que más se ajustan a tu perfil</p>
          <ul className={styles.mockFit}>
            {VACANCIES.map((v) => (
              <li key={v.title}>
                <div>
                  <p>{v.title}</p>
                  <small>{v.where}</small>
                </div>
                <span className={styles.fitBar}><span style={{ width: `${v.fit * 100}%` }} /></span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </div>
  );
}
