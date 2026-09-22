import { supabase } from './supabase';

export interface ContatoDoFornecedor {
  whatsapp: string;
  email: string;
}

interface LinhaDeContato {
  id: string;
  whatsapp: string | null;
  email: string | null;
}

/**
 * WhatsApp e e-mail dos fornecedores, para as telas de admin.
 *
 * Por que não vem junto com o resto do cadastro: um vendedor chegou no
 * WhatsApp da MS Digital e foi falar de estoque direto. A policy de leitura de
 * `suppliers` libera a linha inteira para qualquer usuário logado, e RLS
 * escolhe LINHA, não coluna — esconder o campo na tela não escondia nada, o
 * número seguia a uma consulta de console de distância. A migração
 * 20260922040000 tirou as duas colunas do alcance de `authenticated`, e o
 * admin (que também é `authenticated`) passa a buscá-las por aqui.
 *
 * O caminho direto continua como reserva porque o deploy do front é
 * automático e a migração é rodada à mão: no intervalo entre os dois, a função
 * ainda não existe e as colunas ainda são legíveis. Nos dois momentos a tela
 * do admin mostra o contato.
 */
export async function carregarContatosDosFornecedores(): Promise<
  Map<string, ContatoDoFornecedor>
> {
  const { data: pelaFuncao, error } = await supabase.rpc(
    'admin_contato_dos_fornecedores'
  );

  const linhas: LinhaDeContato[] = error
    ? ((await supabase.from('suppliers').select('id, whatsapp, email')).data ??
      [])
    : ((pelaFuncao ?? []) as LinhaDeContato[]);

  const porId = new Map<string, ContatoDoFornecedor>();

  for (const linha of linhas) {
    porId.set(linha.id, {
      whatsapp: linha.whatsapp ?? '',
      email: linha.email ?? '',
    });
  }

  return porId;
}

/** O contato deste fornecedor, ou vazio quando não veio nenhum. */
export function contatoDe(
  contatos: Map<string, ContatoDoFornecedor>,
  supplierId: string
): ContatoDoFornecedor {
  return contatos.get(supplierId) ?? { whatsapp: '', email: '' };
}
