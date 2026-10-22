-- O vendedor deixa de alcançar o contato do fornecedor, no banco.
--
-- POR QUE
--
-- Um vendedor chegou no WhatsApp da MS Digital e foi falar de estoque direto.
-- A migração 20260921120000 limpou a cópia que ficava dentro do pedido, e o
-- código parou de buscar o campo nas telas. Faltava a porta principal.
--
-- Conferido no banco em 22/09/2026:
--
--   policy "Authenticated users can read active suppliers"
--     for select to authenticated
--     using (status = 'active' or <é admin>)
--
-- Ou seja: QUALQUER usuário logado lê a linha inteira de todo fornecedor
-- ativo. Esconder na tela não adianta — basta abrir o console do navegador e
-- pedir `from('suppliers').select('whatsapp, email')` que vem tudo.
--
-- A RLS não resolve isso: ela decide QUAIS LINHAS alguém vê, não quais
-- colunas. Quem decide coluna é o GRANT.
--
-- O QUE MUDA
--
-- `authenticated` perde o SELECT na tabela inteira e recebe de volta só as
-- colunas que o vendedor precisa. Ficam de fora:
--
--   whatsapp, email  -> o contato. É o que não pode vazar.
--
-- Só essas duas. `notes` também é coisa interna, mas o admin lê e escreve a
-- anotação no formulário de fornecedor, e tirá-la daqui obrigaria a passar
-- mais uma coluna pela função — mais peça quebrando para nada, já que
-- anotação não abre canal com ninguém.
--
-- O que o vendedor continua lendo, porque as telas dependem: nome, empresa,
-- cidade, estado, prazo, status, chave PIX (ele paga o repasse), horário de
-- corte, avisos, taxa de embalagem, controle de estoque e o endereço de
-- remetente.
--
-- O ADMIN
--
-- Admin também é `authenticated`, então ele perde as duas colunas junto. Volta
-- pela função abaixo, que confere o papel antes de responder. O Portal do
-- Fornecedor não precisa de nenhuma delas (o `email` que ele lia nem era
-- usado em lugar nenhum — saiu do código junto com esta migração).
--
-- As Edge Functions e a sincronização do catálogo usam service_role, que tem
-- grant próprio e não é afetado.

begin;

revoke select on public.suppliers from authenticated;

grant select (
  id,
  user_id,
  name,
  company_name,
  city,
  state,
  category,
  average_shipping_time,
  status,
  notes,
  created_at,
  updated_at,
  auth_user_id,
  exige_pagamento_antecipado,
  controla_estoque,
  chave_pix,
  horario_corte,
  horario_corte_flex,
  avisos,
  cep,
  logradouro,
  numero,
  bairro,
  complemento,
  taxa_embalagem
) on public.suppliers to authenticated;


-- ----------------------------------------------------------------------------
-- A porta do admin
--
-- `security definer` porque o admin, como qualquer `authenticated`, não tem
-- mais o grant nessas colunas. A função roda com o dono e devolve o contato
-- só depois de conferir o papel — e devolve vazio, não erro, para quem não é
-- admin, que é como as outras telas já se comportam.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_contato_dos_fornecedores();

create function public.admin_contato_dos_fornecedores()
returns table (id uuid, whatsapp text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.whatsapp, s.email
  from public.suppliers s
  where exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
$$;

comment on function public.admin_contato_dos_fornecedores() is
  'WhatsApp e e-mail dos fornecedores, só para admin. Existe porque o grant de coluna tirou essas duas da tabela para todo authenticated — ver migração 20260922040000.';

-- Função nasce executável por PUBLIC. Sem este revoke, o grant abaixo não
-- fecha nada.
revoke all on function public.admin_contato_dos_fornecedores() from public, anon, authenticated;
grant execute on function public.admin_contato_dos_fornecedores() to authenticated;

commit;


-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira os resultados
-- ============================================================================

-- (a) `authenticated` não pode mais ter privilégio em whatsapp/email.
--     Esta consulta precisa vir VAZIA.
-- select column_name, privilege_type
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'suppliers'
--   and grantee = 'authenticated'
--   and column_name in ('whatsapp', 'email');

-- (b) E precisa continuar tendo nas outras (25 colunas de SELECT).
-- select count(*) as colunas_liberadas
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'suppliers'
--   and grantee = 'authenticated' and privilege_type = 'SELECT';

-- (c) Teste ao vivo, que é o que vale: entre com uma conta de vendedor comum
--     e rode no console do navegador —
--       await supabase.from('suppliers').select('name, whatsapp')
--     Precisa voltar erro de permissão na coluna whatsapp. Trocando por
--       await supabase.from('suppliers').select('name, city')
--     precisa voltar a lista normalmente.
