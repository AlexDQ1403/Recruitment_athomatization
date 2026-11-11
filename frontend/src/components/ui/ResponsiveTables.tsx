'use client';
import { useEffect } from 'react';

/** En el celular las tablas se ven como tarjetas: cada celda lleva el título de su columna (data-label) */
export function ResponsiveTables({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;

    const label = () => {
      for (const table of Array.from(root.querySelectorAll<HTMLTableElement>('table.candidate-table'))) {
        const heads = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim() ?? '');
        for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
          Array.from(row.children).forEach((cell, i) => {
            const text = (cell as HTMLTableCellElement).colSpan > 1 ? '' : heads[i] ?? '';
            if (cell.getAttribute('data-label') !== text) cell.setAttribute('data-label', text);
          });
        }
      }
    };

    label();
    const observer = new MutationObserver(label);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [rootId]);

  return null;
}
