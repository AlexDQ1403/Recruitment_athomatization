import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalLayout, type LegalSection } from '../../components/legal/LegalLayout';
import styles from '../../components/legal/legal.module.css';
import { LEGAL, responsablesText } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Política de Tratamiento de Datos Personales — Kmella',
  description: 'Cómo Kmella recolecta, usa y protege tus datos personales según la Ley 1581 de 2012.',
};

const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const sections: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Responsable del tratamiento',
    body: (
      <>
        <p>
          Los responsables del tratamiento de los datos personales recolectados a través de {LEGAL.brand} ({LEGAL.site}) son{' '}
          <strong>{responsablesText()}</strong>, personas naturales, que actúan de forma conjunta.
        </p>
        <ul>
          <li><strong>Domicilio:</strong> {LEGAL.domicile}</li>
          <li><strong>Correo electrónico:</strong> {mail}</li>
          <li>
            <strong>Teléfonos:</strong>{' '}
            {LEGAL.phones.map((p, i) => (
              <span key={p}>
                {i > 0 && ' · '}
                <a href={`tel:${p.replace(/\s/g, '')}`}>{p}</a>
              </span>
            ))}
          </li>
        </ul>
        <p>
          Esta política se expide en cumplimiento de la Ley Estatutaria 1581 de 2012, el Decreto 1377 de 2013 (compilado en el
          Decreto Único 1074 de 2015) y demás normas que los modifiquen o complementen.
        </p>
      </>
    ),
  },
  {
    id: 'definiciones',
    title: 'Definiciones',
    body: (
      <ul>
        <li><strong>Titular:</strong> la persona natural cuyos datos personales son objeto de tratamiento.</li>
        <li><strong>Dato personal:</strong> cualquier información vinculada o que pueda asociarse a una persona natural determinada o determinable.</li>
        <li><strong>Dato sensible:</strong> el que afecta la intimidad del titular o cuyo uso indebido puede generar discriminación (origen racial o étnico, orientación política, convicciones religiosas, salud, vida sexual, datos biométricos, entre otros).</li>
        <li><strong>Tratamiento:</strong> cualquier operación sobre datos personales, como recolección, almacenamiento, uso, circulación o supresión.</li>
        <li><strong>Autorización:</strong> consentimiento previo, expreso e informado del titular para llevar a cabo el tratamiento.</li>
        <li><strong>Encargado:</strong> quien realiza el tratamiento por cuenta del responsable.</li>
        <li><strong>Transferencia y transmisión:</strong> envío de datos a otro responsable (transferencia) o a un encargado (transmisión), dentro o fuera de Colombia.</li>
      </ul>
    ),
  },
  {
    id: 'datos',
    title: 'Qué datos tratamos',
    body: (
      <>
        <h3>Personas que buscan empleo (cuenta de candidato)</h3>
        <p>
          Nombre, correo, teléfono, ciudad, cargo de interés, años de experiencia, aspiración salarial, habilidades, formación,
          historial laboral, enlaces a perfiles profesionales, la hoja de vida que subas y tus postulaciones (incluidas las que
          registres de otros sitios web).
        </p>
        <h3>Empresas y reclutadores</h3>
        <p>
          Nombre, correo, cargo y teléfono de quienes usan la cuenta; nombre y sector de la empresa; vacantes, búsquedas,
          decisiones sobre candidatos y notas de seguimiento.
        </p>
        <h3>Candidatos encontrados en fuentes públicas</h3>
        <p>
          A pedido de un reclutador, {LEGAL.brand} puede buscar perfiles profesionales publicados en internet (por ejemplo, en
          LinkedIn) y guardar nombre, cargo, ubicación, resumen profesional y el enlace al perfil. Estos datos se usan solo para
          proponer a la persona una oportunidad laboral concreta. En el primer contacto le informamos de dónde obtuvimos sus datos,
          esta política y cómo pedir que la eliminemos.
        </p>
        <h3>Datos técnicos</h3>
        <p>
          Dirección IP, navegador, fecha y hora de acceso y registros de actividad, para seguridad, prevención de fraude y como
          prueba de la autorización que otorgas.
        </p>
        <p className={styles.note}>
          <strong>No pedimos datos sensibles.</strong> Te recomendamos no incluir en tu hoja de vida información como estado de
          salud, religión, afiliación política, orientación sexual, origen étnico, número de documento ni fotografía. Si los
          incluyes, su suministro es facultativo y solo se usarán para el proceso de selección al que te postules.
        </p>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para qué usamos tus datos',
    body: (
      <ul>
        <li>Crear y administrar tu cuenta y verificar tu identidad al ingresar.</li>
        <li>Si eres candidato: llenar tu perfil a partir de tu hoja de vida, recomendarte vacantes, calcular qué tanto encajas en cada una, darte consejos para mejorar tu hoja de vida y mostrarte ofertas de otros sitios web.</li>
        <li>Compartir tu perfil con las empresas cuyas vacantes coincidan contigo o a las que te postules. Tu teléfono y correo solo se muestran a la empresa cuando autoriza que pases a la siguiente fase.</li>
        <li>Si eres empresa o reclutador: buscar y organizar candidatos, publicar vacantes, registrar decisiones y generar reportes.</li>
        <li>Contactar a candidatos sobre oportunidades laborales concretas.</li>
        <li>Enviar correos de servicio (confirmación de cuenta, invitaciones, recuperación de contraseña).</li>
        <li>Mantener la seguridad de la plataforma, atender consultas y reclamos y cumplir obligaciones legales.</li>
        <li>Generar estadísticas agregadas y anónimas para mejorar el servicio.</li>
      </ul>
    ),
  },
  {
    id: 'ia',
    title: 'Uso de inteligencia artificial',
    body: (
      <>
        <p>
          Usamos modelos de inteligencia artificial para leer hojas de vida, sugerir el contenido de un perfil o una vacante,
          interpretar búsquedas escritas en lenguaje natural y estimar el porcentaje de ajuste entre un perfil y una vacante.
        </p>
        <p>
          Estos resultados son una ayuda: <strong>ninguna decisión de contratación se toma de forma automática</strong>. Siempre
          la toma una persona de la empresa. En las búsquedas y en el cálculo de ajuste no enviamos al modelo tu correo ni tu
          teléfono; para leer tu hoja de vida, el modelo procesa su texto solo para extraer los datos de tu perfil. Puedes revisar
          y corregir lo que la IA llenó antes de guardarlo.
        </p>
      </>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    body: (
      <>
        <p>Como titular tienes derecho a (artículo 8 de la Ley 1581 de 2012):</p>
        <ul>
          <li>Conocer, actualizar y rectificar tus datos, incluso si son parciales, inexactos, incompletos o inducen a error.</li>
          <li>Solicitar prueba de la autorización que otorgaste.</li>
          <li>Ser informado, previa solicitud, sobre el uso que se ha dado a tus datos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), después de haber agotado el trámite de consulta o reclamo ante nosotros.</li>
          <li>Revocar la autorización y pedir la supresión de tus datos cuando no se respeten los principios, derechos y garantías legales, siempre que no exista un deber legal o contractual de conservarlos.</li>
          <li>Acceder gratuitamente a tus datos personales.</li>
        </ul>
        <p>
          Muchos de estos derechos los puedes ejercer directamente desde tu cuenta (editar tu perfil, eliminar tu hoja de vida).
          Para lo demás, escríbenos.
        </p>
      </>
    ),
  },
  {
    id: 'autorizacion',
    title: 'Autorización',
    body: (
      <>
        <p>
          Al crear una cuenta marcas la casilla en la que aceptas esta política y los{' '}
          <Link href="/terminos">Términos y Condiciones</Link>. Guardamos la fecha, la versión aceptada, la dirección IP y el
          navegador como prueba de tu autorización. Si cambiamos esta política de forma sustancial te pediremos aceptarla de nuevo.
        </p>
        <p>
          No se requiere autorización cuando los datos son de naturaleza pública, en casos de urgencia médica o sanitaria, cuando
          lo pida una autoridad en ejercicio de sus funciones, para fines históricos, estadísticos o científicos, o para datos del
          registro civil (artículo 10 de la Ley 1581 de 2012). Aun así, a las personas cuyos perfiles encontramos en fuentes
          públicas les informamos en el primer contacto y respetamos su decisión de no ser contactadas.
        </p>
      </>
    ),
  },
  {
    id: 'menores',
    title: 'Niños, niñas y adolescentes',
    body: (
      <p>
        {LEGAL.brand} está dirigido a personas mayores de 18 años. No recolectamos a sabiendas datos de menores de edad; si
        detectamos que una cuenta pertenece a un menor, la eliminaremos.
      </p>
    ),
  },
  {
    id: 'procedimiento',
    title: 'Consultas y reclamos',
    body: (
      <>
        <p>
          El área encargada de atender peticiones, consultas y reclamos son los responsables del tratamiento, a través del correo{' '}
          {mail}. Puedes presentar la solicitud tú mismo, tus causahabientes, tu representante o apoderado, acreditando la
          identidad.
        </p>
        <h3>Consultas</h3>
        <p>
          Para conocer qué datos tuyos tenemos y cómo los usamos. Responderemos en un máximo de <strong>diez (10) días
          hábiles</strong> desde que la recibamos. Si no es posible, te informaremos el motivo y la fecha de respuesta, que no
          superará cinco (5) días hábiles adicionales.
        </p>
        <h3>Reclamos</h3>
        <p>
          Para corregir, actualizar o suprimir datos, revocar la autorización o reportar un incumplimiento. El reclamo debe incluir
          tu nombre e identificación, la descripción de los hechos, la dirección o correo de respuesta y los documentos que
          quieras hacer valer.
        </p>
        <ul>
          <li>Si el reclamo está incompleto te pediremos completarlo dentro de los cinco (5) días hábiles siguientes. Si pasan dos (2) meses sin que lo completes, entenderemos que desististe.</li>
          <li>Una vez recibido completo, marcaremos el dato con la leyenda «reclamo en trámite» en un máximo de dos (2) días hábiles.</li>
          <li>Responderemos en un máximo de <strong>quince (15) días hábiles</strong>. Si no es posible, te informaremos el motivo y la nueva fecha, que no superará ocho (8) días hábiles adicionales.</li>
        </ul>
        <p>
          Si no estás conforme con la respuesta, puedes acudir a la Superintendencia de Industria y Comercio (
          <a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer">www.sic.gov.co</a>).
        </p>
      </>
    ),
  },
  {
    id: 'encargados',
    title: 'Proveedores y transferencia internacional',
    body: (
      <>
        <p>
          Para prestar el servicio usamos proveedores que tratan datos por nuestra cuenta (encargados). Algunos están fuera de
          Colombia, principalmente en Estados Unidos, país que la SIC reconoce con nivel adecuado de protección (Circular Externa
          005 de 2017). Al aceptar esta política autorizas esta transmisión.
        </p>
        <table className={styles.table}>
          <thead>
            <tr><th>Proveedor</th><th>Para qué</th><th>Ubicación</th></tr>
          </thead>
          <tbody>
            <tr><td>Supabase</td><td>Base de datos, cuentas y archivos (hojas de vida)</td><td>Estados Unidos</td></tr>
            <tr><td>Render</td><td>Servidores de la aplicación</td><td>Estados Unidos</td></tr>
            <tr><td>OpenRouter / OpenAI</td><td>Modelos de inteligencia artificial</td><td>Estados Unidos</td></tr>
            <tr><td>SerpApi</td><td>Búsqueda de ofertas y perfiles públicos en internet</td><td>Estados Unidos</td></tr>
            <tr><td>Google (Gmail)</td><td>Envío de correos de servicio</td><td>Estados Unidos</td></tr>
          </tbody>
        </table>
        <p>
          A los servicios de búsqueda de ofertas externas solo les enviamos el cargo y la ciudad que buscas, nunca tu nombre ni tus
          datos de contacto. No vendemos ni alquilamos tus datos.
        </p>
      </>
    ),
  },
  {
    id: 'seguridad',
    title: 'Seguridad y conservación',
    body: (
      <>
        <p>
          Aplicamos medidas técnicas y administrativas razonables: conexión cifrada (HTTPS), contraseñas que nunca guardamos en
          texto plano, acceso por roles (cada empresa ve solo su información), límites de uso y registros de actividad. Ningún
          sistema es infalible; si ocurre un incidente que afecte tus datos, te lo informaremos y lo reportaremos a la SIC.
        </p>
        <p>
          Conservamos tus datos mientras tu cuenta esté activa y luego el tiempo necesario para atender obligaciones legales o
          reclamos. Los perfiles obtenidos de fuentes públicas que no tengan actividad se eliminan o anonimizan en un plazo máximo
          de doce (12) meses, o antes si la persona lo pide.
        </p>
      </>
    ),
  },
  {
    id: 'almacenamiento',
    title: 'Cookies y almacenamiento en tu navegador',
    body: (
      <>
        <p>
          {LEGAL.brand} <strong>no usa cookies publicitarias ni de analítica</strong>, ni comparte tu navegación con terceros. Solo
          guardamos en el almacenamiento local de tu navegador lo necesario para que la aplicación funcione:
        </p>
        <table className={styles.table}>
          <thead>
            <tr><th>Qué guardamos</th><th>Para qué</th></tr>
          </thead>
          <tbody>
            <tr><td>Sesión de inicio (Supabase)</td><td>Mantenerte conectado de forma segura</td></tr>
            <tr><td>Datos básicos del perfil</td><td>Mostrar tu nombre y rol sin recargar</td></tr>
            <tr><td>Tema claro u oscuro</td><td>Recordar tu preferencia de colores</td></tr>
            <tr><td>Pausa de animaciones</td><td>Respetar tu preferencia de movimiento</td></tr>
            <tr><td>Consejos de Semi vistos u ocultos</td><td>No repetir la guía que ya leíste</td></tr>
            <tr><td>Aviso de almacenamiento cerrado</td><td>No volver a mostrar ese aviso</td></tr>
          </tbody>
        </table>
        <p>
          Como son estrictamente necesarios o solo recuerdan tus preferencias, no requieren aceptación previa. Puedes borrarlos en
          cualquier momento desde la configuración de tu navegador; al hacerlo se cerrará tu sesión.
        </p>
      </>
    ),
  },
  {
    id: 'vigencia',
    title: 'Vigencia y cambios',
    body: (
      <p>
        Esta política rige desde el {LEGAL.effectiveDate} (versión {LEGAL.version}) y las bases de datos se mantendrán vigentes
        mientras {LEGAL.brand} preste el servicio. Cualquier cambio sustancial se publicará en esta página y se te informará antes
        de aplicarse, pidiendo de nuevo tu autorización cuando cambien las finalidades.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de Tratamiento de Datos Personales"
      intro={
        <p>
          Aquí te contamos qué datos recogemos en {LEGAL.brand}, para qué los usamos, con quién los compartimos y cómo puedes
          conocerlos, corregirlos o pedir que los borremos. La escribimos en lenguaje claro; si algo no se entiende, escríbenos a{' '}
          {mail}.
        </p>
      }
      sections={sections}
    />
  );
}
