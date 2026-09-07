import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifySession(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const supabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'superAdmin' ? user : null;
}

export async function GET(req: NextRequest) {
  const caller = await verifySession(req);
  if (!caller) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, email')
    .order('full_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const caller = await verifySession(req);
  if (!caller) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body: { email?: string; password?: string; full_name?: string; role?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }); }

  const { email, password, full_name, role } = body;
  if (!email || !password || !full_name) {
    return NextResponse.json({ error: 'email, password y full_name son requeridos' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  }

  let admin;
  try { admin = getAdminClient(); } catch {
    return NextResponse.json({ error: 'Gestión de usuarios no disponible: configura SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    user_metadata: { full_name, role: role ?? 'recruiter' },
    email_confirm: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name,
    role: role ?? 'recruiter',
  });

  return NextResponse.json({ id: data.user.id, email, full_name, role: role ?? 'recruiter' }, { status: 201 });
}
