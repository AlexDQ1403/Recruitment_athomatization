'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStoredUser } from '../../lib/auth';
import { User } from '../../types';
import styles from './landing.module.css';

// Si ya hay sesión, el botón principal lleva directo al panel correspondiente
export function NavActions() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  if (user) {
    const home = user.role === 'candidato' ? '/candidate/profile' : '/dashboard';
    return (
      <Link href={home} className={styles.pill}>
        Ir a mi panel
      </Link>
    );
  }

  return (
    <>
      <Link href="/login" className={styles.navLink}>
        Iniciar sesión
      </Link>
      <Link href="/register" className={styles.pill}>
        Crear cuenta
      </Link>
    </>
  );
}
