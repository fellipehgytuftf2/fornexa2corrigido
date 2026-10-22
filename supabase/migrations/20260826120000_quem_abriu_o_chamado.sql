-- Nome de quem abriu cada chamado, para o admin.
--
-- A tela de chamados sempre mostrou assunto, mensagem e data — nunca o autor.
-- Para o vendedor tanto faz: ele só vê os próprios. Para o admin era o dado
-- que mais faltava: chegava um chamado e não dava para saber com quem falar
-- sem procurar o `user_id` na mão no banco.
--
-- Vem por função em vez de junção na tela porque o admin não tem leitura
-- garantida de `profiles` e `suppliers` alheios pelas políticas de RLS. É o
-- mesmo caminho que `admin_mapa_de_acesso` já usa.
--
-- Os dois lados podem vir preenchidos ao mesmo tempo: chamado aberto no
-- Portal do Fornecedor tem `supplier_id`, e o `user_id` continua sendo o do
-- vendedor dono do pedido. Quem abriu, nesse caso, é o fornecedor.

create or replace function public.admin_quem_abriu_chamado()
returns table (
  ticket_id uuid,
  vendedor_nome text,
  vendedor_email text,
  fornecedor_nome text,
  fornecedor_email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores podem ver quem abriu os chamados';
  end if;

  return query
  select
    t.id,
    nullif(p.name, ''),
    p.email,

    -- `company_name` primeiro: é o nome pelo qual o fornecedor é conhecido na
    -- operação. `name` é o contato, e serve de reserva.
    coalesce(nullif(f.company_name, ''), nullif(f.name, '')),
    f.email

  from public.tickets t
  left join public.profiles p on p.id = t.user_id
  left join public.suppliers f on f.id = t.supplier_id;
end;
$$;

grant execute on function public.admin_quem_abriu_chamado() to authenticated;
