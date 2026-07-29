import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

// O Supabase está trocando o sistema de chaves: a `anon` sai de cena até o
// fim de 2026 e dá lugar à publishable (`sb_publishable_...`). Aceita as duas
// para a troca poder ser feita aqui e na Vercel em momentos diferentes, sem
// o site ficar fora do ar no intervalo.
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL não encontrada no .env.local');
}

if (!supabaseKey) {
  throw new Error(
    'Chave do Supabase não encontrada. Defina VITE_SUPABASE_PUBLISHABLE_KEY no .env.local.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Em desenvolvimento, deixa o cliente acessível pelo console do navegador.
// Serve para testar permissão de verdade — como conferir que o fornecedor
// realmente não lê `orders`. Não vai para o build de produção.
if (import.meta.env.DEV) {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}