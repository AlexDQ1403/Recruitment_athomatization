import { Reveal } from './Reveal';
import styles from './landing.module.css';

type Feature = { title: string; text: string };

/** Lo que hace Kmella para cada público, en pasos numerados */
export function FeatureList({ items }: { items: Feature[] }) {
  return (
    <ol className={styles.features}>
      {items.map((f, i) => (
        <Reveal key={f.title} delay={80 * i}>
          <li className={styles.feature}>
            <span className={styles.featureNum}>0{i + 1}</span>
            <div>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureText}>{f.text}</p>
            </div>
          </li>
        </Reveal>
      ))}
    </ol>
  );
}

export const COMPANY_FEATURES: Feature[] = [
  { title: 'Busca escribiendo lo que necesitas', text: 'Una frase con cargo, ciudad, experiencia o salario. Ves los perfiles ordenados por afinidad y, si en tu base no hay suficientes, Kmella los busca en LinkedIn.' },
  { title: 'Contacta con un clic', text: 'WhatsApp, correo o LinkedIn con un mensaje ya redactado para cada candidato. Queda registrado quién contactó a quién y cuándo.' },
  { title: 'Vacantes que llena la IA', text: 'Describe la vacante con tus palabras y el formulario se completa solo; tú revisas antes de publicar. Compartes el enlace para que se postulen.' },
  { title: 'La empresa decide con datos', text: 'El reclutador presenta a los mejores; la empresa los autoriza para la siguiente fase o los descarta con un motivo. Dashboard y reportes exportables.' },
];

export const CANDIDATE_FEATURES: Feature[] = [
  { title: 'Sube tu hoja de vida', text: 'La IA la lee y llena tu perfil: experiencia, formación y habilidades. Tú revisas y corriges antes de guardar.' },
  { title: 'Vacantes que encajan contigo', text: 'Cada vacante muestra su porcentaje de ajuste, qué tienes y qué te falta. Incluye ofertas de otros portales como elempleo, Computrabajo y LinkedIn.' },
  { title: 'Ajusta tu HV a cada vacante', text: 'Antes de postularte recibes consejos concretos: qué poner primero y qué palabras usar, sin inventar experiencia.' },
  { title: 'Sigue tus postulaciones', text: 'Tu tablero muestra cuántas llevas, cuáles cambiaron de estado y cuáles necesitan seguimiento, aquí y en otros sitios.' },
];

/** Vista de ejemplo del tablero "Mi búsqueda" del candidato */
export function JobSearchMock() {
  return (
    <div className={`${styles.mock} ${styles.searchMock}`} aria-hidden="true">
      <div className={styles.mockHead}>
        <div>
          <p className={styles.mockTitle}>Mi búsqueda</p>
          <p className={styles.mockMeta}>Llevas buscando 21 días</p>
        </div>
      </div>
      <div className={styles.kpis}>
        <div><b>6</b><small>Postulaciones</small></div>
        <div><b>50 %</b><small>Te respondieron</small></div>
        <div><b>4,5</b><small>Días en responder</small></div>
      </div>
      <ul className={styles.weekBars}>
        {[0, 1, 0, 2, 1, 3, 2, 1].map((n, i) => (
          <li key={i}><span style={{ height: `${12 + n * 22}%` }} data-now={i === 7 || undefined} /></li>
        ))}
      </ul>
      <p className={styles.mockSub}>Haz seguimiento</p>
      <ul className={styles.decisionList}>
        <li>
          <div className={styles.decisionInfo}>
            <p>Contador junior</p>
            <small>Externa · elempleo.com</small>
          </div>
          <small className={styles.warnText}>Sin respuesta hace 12 días</small>
        </li>
        <li>
          <div className={styles.decisionInfo}>
            <p>Analista contable</p>
            <small>En la plataforma</small>
          </div>
          <span className={styles.statusOk}>Siguiente fase</span>
        </li>
      </ul>
    </div>
  );
}
