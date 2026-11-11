import { Reveal } from './Reveal';
import { CandidateDemo, CompanyDemo, RecruiterDemo } from './RoleDemo';
import styles from './landing.module.css';

// Los tres roles de Kmella; cada tarjeta es una demostración animada de lo que dice su texto

export function RoleShowcase() {
  return (
    <div className={styles.showcase}>
      {/* ─── Empresa: invita, decide y mide ─── */}
      <Reveal className={styles.showcaseCol}>
        <h3 className={styles.headingSm}>La empresa</h3>
        <p className={styles.bodyMuted}>
          Crea la cuenta de tu empresa e invita a tus reclutadores por correo.
          Decides quién pasa a la siguiente fase con el perfil completo a la vista,
          y sigues los resultados en el dashboard y en reportes exportables.
        </p>
        <CompanyDemo />
      </Reveal>

      {/* ─── Reclutador: busca, contacta y crea vacantes ─── */}
      <Reveal delay={100} className={styles.showcaseCol}>
        <h3 className={styles.headingSm}>El reclutador</h3>
        <p className={styles.bodyMuted}>
          Busca candidatos escribiendo lo que necesita, los contacta con un
          mensaje listo y crea vacantes describiéndolas con sus palabras: la IA
          llena el formulario.
        </p>
        <RecruiterDemo />
      </Reveal>

      {/* ─── Candidato: HV, vacantes, consejos y seguimiento ─── */}
      <Reveal delay={200} className={styles.showcaseCol}>
        <h3 className={styles.headingSm}>El candidato</h3>
        <p className={styles.bodyMuted}>
          Sube tu hoja de vida y la IA llena tu perfil. Ves primero las vacantes
          que más se ajustan, aquí y en otros portales, con consejos para adaptar
          tu HV a cada una y un tablero para seguir tus postulaciones.
        </p>
        <CandidateDemo />
      </Reveal>
    </div>
  );
}
