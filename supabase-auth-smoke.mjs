import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;

if(!url || !key) { console.error('Missing VITE vars'); process.exit(1); }
if(!email || !password) { console.error('Missing TEST_EMAIL / TEST_PASSWORD'); process.exit(1); }

const supabase = createClient(url, key);

const run = async () => {
  const { data: authData, error: authErr } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authErr) { console.error('LOGIN failed:', authErr); process.exit(1); }

  const { data, error } = await supabase
    .from('components')
    .insert({ name: 'TEST - Insert after RLS', status: 'active', critical: false, tags: ['test'] })
    .select('id,name')
    .single();

  if (error) { console.error('INSERT failed:', error); process.exit(1); }

  console.log('INSERT ok:', data);

  const { data: rows, error: selErr } = await supabase
    .from('components')
    .select('id,name')
    .order('created_at', { ascending: false })
    .limit(5);

  if (selErr) { console.error('SELECT failed:', selErr); process.exit(1); }

  console.log('SELECT ok. Rows:', rows.length);
  console.log(rows);
};

run();
