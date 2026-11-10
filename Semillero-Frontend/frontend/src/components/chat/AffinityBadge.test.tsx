import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AffinityBadge, affinityLevel } from './AffinityBadge';

describe('AffinityBadge', () => {
  it('muestra el porcentaje y, al abrirlo, de dónde sale', async () => {
    const { container } = render(
      <AffinityBadge
        score={86}
        parts={[
          { factor: 'cargo', score: 1, weight: 50 },
          { factor: 'experiencia', score: 0.5, weight: 20, missing: true },
        ]}
      />
    );
    expect(screen.getByText('86 %')).toBeInTheDocument();
    expect(container.querySelector('details')).toHaveClass('affinity-alta');

    await userEvent.click(screen.getByText('86 %'));
    expect(screen.getByText('Experiencia').closest('li')).toHaveTextContent('sin dato');
    expect(screen.getByText('Cargo').closest('li')).toHaveTextContent('peso 71 %');
    expect(screen.getByText(/No es la probabilidad de que acepte/)).toBeInTheDocument();
  });

  it('niveles por umbral', () => {
    expect(affinityLevel(75)).toBe('alta');
    expect(affinityLevel(50)).toBe('media');
    expect(affinityLevel(49)).toBe('baja');
  });
});
