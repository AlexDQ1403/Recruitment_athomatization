import { describe, it, expect } from 'vitest';
import { buildContactMessage, shortRole, whatsappUrl, mailtoUrl, formatPhone } from './contact';

describe('buildContactMessage', () => {
  it('personaliza con nombre, cargo, ciudad, reclutador y empresa', () => {
    const { subject, body } = buildContactMessage({
      fullName: 'LAURA marcela Ríos',
      role: 'Contadora Pública | NIIF | Impuestos',
      location: 'Cali',
      recruiterName: 'Sofía Pérez',
      companyName: 'Acme SAS',
    });
    expect(body).toMatch(/^Hola Laura, ¿cómo estás\?/);
    expect(body).toContain('Soy Sofía Pérez, de Acme SAS.');
    expect(body).toContain('Vi tu perfil como Contadora Pública y creo');
    expect(body).toContain('oportunidad que tenemos en Cali.');
    expect(subject).toBe('Oportunidad laboral: Contadora Pública · Acme SAS');
  });

  it('sin datos opcionales sigue siendo un mensaje correcto', () => {
    const { subject, body } = buildContactMessage({ fullName: 'Mario' });
    expect(body).toContain('Te escribo del equipo de selección.');
    expect(body).toContain('Vi tu perfil y creo que encaja muy bien con una oportunidad que tenemos.');
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('null');
    expect(subject).toBe('Oportunidad laboral');
  });
});

describe('shortRole', () => {
  it.each([
    ['Contadora Pública | NIIF', 'Contadora Pública'],
    ['Desarrollador Java - Spring', 'Desarrollador Java'],
    ['Analista · Datos', 'Analista'],
    ['Auxiliar contable', 'Auxiliar contable'],
    ['', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(shortRole(input)).toBe(expected);
  });
});

describe('enlaces', () => {
  it('wa.me usa solo dígitos y codifica el texto', () => {
    expect(whatsappUrl('+573001234567', 'Hola Ana, ¿cómo estás?\n\nSaludos'))
      .toBe('https://wa.me/573001234567?text=Hola%20Ana%2C%20%C2%BFc%C3%B3mo%20est%C3%A1s%3F%0A%0ASaludos');
  });

  it('mailto codifica asunto y cuerpo', () => {
    expect(mailtoUrl('ana@correo.com', 'Oportunidad & más', 'Línea 1\nLínea 2'))
      .toBe('mailto:ana@correo.com?subject=Oportunidad%20%26%20m%C3%A1s&body=L%C3%ADnea%201%0AL%C3%ADnea%202');
  });

  it('formatea celulares colombianos y deja otros como vienen', () => {
    expect(formatPhone('+573001234567')).toBe('+57 300 123 4567');
    expect(formatPhone('+14155550100')).toBe('+14155550100');
  });
});
