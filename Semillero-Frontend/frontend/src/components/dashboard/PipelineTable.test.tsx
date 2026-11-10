import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PipelineRow, PipelineStage } from '../../types';
import { PipelineTable } from './PipelineTable';

const row = (over: Partial<PipelineRow>): PipelineRow => ({
  kind: 'legacy', id: 'x', full_name: 'X', title: null, source: 'scraping', vacancy_id: 'v1', vacancy_title: 'Contador público',
  stage: 'seguimiento', event: { label: 'Agregado a la vacante', at: null, by: null, reason: null }, days: 1, next_action: 'Contactar',
  ...over,
});

const rows: PipelineRow[] = [
  row({ id: 'r1', full_name: 'Rocío', stage: 'rechazado', event: { label: 'Rechazado para «Contador»', at: '2026-11-08', by: 'Sofía', reason: 'Sin NIIF' }, days: 2, next_action: null }),
  row({ id: 'n1', full_name: 'Nuevo', vacancy_id: null, vacancy_title: null, stage: 'sin_vacante', event: { label: 'Encontrado en una búsqueda', at: '2026-11-09', by: null, reason: null }, next_action: 'Asociarlo a una vacante' }),
  row({ id: 'c1', full_name: 'Laura', stage: 'contactado', event: { label: 'Contactado por WhatsApp', at: '2026-11-05', by: 'Andrés', reason: null }, days: 5, next_action: 'Recontactar o decidir' }),
  row({ id: 'a1', full_name: 'Ana', stage: 'aprobado', event: { label: 'Aprobado para la empresa', at: '2026-11-03', by: 'Sofía', reason: null }, days: 7, next_action: 'Recordar a la empresa' }),
];
const counts = { sin_revisar: 0, seguimiento: 0, contactado: 1, aprobado: 1, contratado: 0, descartado_empresa: 0, rechazado: 1, sin_vacante: 1 } as Record<PipelineStage, number>;

const renderIt = (onOpen = vi.fn()) => {
  render(<PipelineTable data={{ counts, total: 4, rows }} loading={false} onOpen={onOpen} />);
  return onOpen;
};
const names = () => screen.getAllByRole('row').slice(1).map((tr) => within(tr).getAllByRole('cell')[0].querySelector('button')?.textContent);

describe('PipelineTable', () => {
  it('lo que pide acción primero; sin vacante al final', () => {
    renderIt();
    expect(names()).toEqual(['Laura', 'Ana', 'Rocío', 'Nuevo']);
  });

  it('muestra quién rechazó, cuándo y por qué', () => {
    renderIt();
    const tr = screen.getByRole('button', { name: 'Rocío' }).closest('tr')!;
    expect(tr).toHaveTextContent('Rechazado para «Contador»');
    expect(tr).toHaveTextContent('por Sofía · hace 2 días');
    expect(tr).toHaveTextContent('Motivo: Sin NIIF');
  });

  it('filtra por etapa con sus conteos y por nombre o vacante', async () => {
    renderIt();
    expect(screen.getByRole('tab', { name: /Todas/ })).toHaveTextContent('4');
    // Solo aparecen las etapas que tienen candidatos
    expect(screen.queryByRole('tab', { name: /Sin revisar/ })).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: /Rechazado/ }));
    expect(names()).toEqual(['Rocío']);

    await userEvent.click(screen.getByRole('tab', { name: /Todas/ }));
    await userEvent.type(screen.getByLabelText('Buscar candidato'), 'laura');
    expect(names()).toEqual(['Laura']);
  });

  it('recontactar abre el perfil en "contactar"; el nombre lo abre en el perfil', async () => {
    const onOpen = renderIt();
    await userEvent.click(screen.getByRole('button', { name: 'Recontactar o decidir' }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c1' }), 'contactar');
    await userEvent.click(screen.getByRole('button', { name: 'Ana' }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a1' }), 'perfil');
  });

  it('a quien está "sin vacante" se le puede asociar a una vacante desde la fila', async () => {
    const onLink = vi.fn().mockResolvedValue(null);
    render(<PipelineTable data={{ counts, total: 4, rows }} loading={false} onOpen={vi.fn()}
      vacancies={[{ id: 'v1', title: 'Contador público' }]} onLink={onLink} />);
    const select = screen.getByLabelText('Vacante para Nuevo');
    expect(screen.getByRole('button', { name: 'Asociar' })).toBeDisabled();
    await userEvent.selectOptions(select, 'v1');
    await userEvent.click(screen.getByRole('button', { name: 'Asociar' }));
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), 'v1');
  });

  it('si no se pudo asociar, lo explica en la fila', async () => {
    const onLink = vi.fn().mockResolvedValue('Tiene cuenta propia: compártele el enlace de la vacante');
    render(<PipelineTable data={{ counts, total: 4, rows }} loading={false} onOpen={vi.fn()}
      vacancies={[{ id: 'v1', title: 'Contador público' }]} onLink={onLink} />);
    await userEvent.selectOptions(screen.getByLabelText('Vacante para Nuevo'), 'v1');
    await userEvent.click(screen.getByRole('button', { name: 'Asociar' }));
    expect(await screen.findByText(/Tiene cuenta propia/)).toBeInTheDocument();
  });
});
