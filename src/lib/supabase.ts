import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL não encontrada no .env.local');
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY não encontrada no .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Em desenvolvimento, deixa o cliente acessível pelo console do navegador.
// Serve para testar permissão de verdade — como conferir que o fornecedor
// realmente não lê `orders`. Não vai para o build de produção.
if (import.meta.env.DEV) {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}