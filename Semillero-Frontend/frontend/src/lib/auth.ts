import { supabase } from './supabase';
import { User } from '../types';

export const getStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('semillero_user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

export const setStoredUser = (user: User) => {
  localStorage.setItem('semillero_user', JSON.stringify(user));
};

export const clearAuth = async () => {
  await supabase.auth.signOut();
  localStorage.removeItem('semillero_user');
};

export const isAuthenticated = () =>
  typeof window !== 'undefined' && !!localStorage.getItem('semillero_user');
