import { supabase } from './supabase';

export interface SupplierAccount {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
}

/**
 * Descobre se a conta logada é de um fornecedor.
 *
 * Retorna o cadastro em `suppliers` ligado a este usuário, ou null quando a
 * conta é de vendedor/admin. A leitura depende da policy
 * "fornecedor_le_proprio_cadastro" — um vendedor comum consultando aqui
 * simplesmente não encontra linha nenhuma.
 */
export async function fetchSupplierAccount(
  userId: string
): Promise<SupplierAccount | null> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, company_name, email')
    .eq('auth_user_id', userId)
    .maybeSingle<SupplierAccount>();

  if (error) {
    console.error('Erro ao verificar conta de fornecedor:', error);
    return null;
  }

  return data;
}
