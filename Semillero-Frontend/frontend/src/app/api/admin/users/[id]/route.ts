import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada');
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await verifySession(req);
  if (!caller) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = params;
  if (id === caller.id) {
    return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 });
  }

  let admin;
  try { admin = getAdminClient(); } catch {
    return NextResponse.json({ error: 'Gestión de usuarios no disponible: configura SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return new NextResponse(null, { status: 204 });
}
