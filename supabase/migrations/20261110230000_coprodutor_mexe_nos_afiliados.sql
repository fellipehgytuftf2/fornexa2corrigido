-- ============================================================================
-- O co-produtor passa a criar e editar afiliados
-- ============================================================================
--
-- Até aqui ele lia a área inteira e não mudava nada. Agora cria, aprova,
-- pausa, troca checkout e preço, renomeia e remove -- tudo o que o admin faz
-- com afiliado.
--
-- A MUDANÇA É NA TABELA, NÃO NA TELA
--
-- Esconder botão nunca foi o que travava: a tabela `afiliados` tinha política
-- de admin para qualquer alteração, e era ela que recusava. Por isso o
-- trabalho aqui é trocar a política, e não liberar um botão.
--
-- São duas, e as duas mudam:
--
--   "só admin decide e configura afiliado"   gravação (insert/update/delete)
--   "afiliado lê o próprio cadastro"         leitura direta da tabela
--
-- A de leitura entra junto por um motivo prático: remover afiliado apaga a
-- linha e lê de volta o que apagou, para saber se apagou mesmo. Sem leitura,
-- a remoção passaria e a tela diria que não passou.
--
-- O QUE ISSO SIGNIFICA, EM DINHEIRO
--
-- Quem mexe em afiliado mexe em comissão: o checkout cadastrado decide em que
-- conta a venda cai, e o preço decide o que a landing dele anuncia. Não é uma
-- permissão de leitura com botão a mais -- é a chave da parceria.
--
-- Fica registrado porque a decisão foi do dono, e porque o caminho de volta é
-- esta mesma migration com 'coprodutor' retirado das três regras abaixo.

-- ----------------------------------------------------------------------------
-- 1. Gravar
-- ----------------------------------------------------------------------------

drop policy if exists "só admin decide e configura afiliado" on public.afiliados;
drop policy if exists "admin e co-produtor configuram afiliado" on public.afiliados;

create policy "admin e co-produtor configuram afiliado"
  on public.afiliados
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Ler a tabela direto
-- ----------------------------------------------------------------------------
-- O afiliado continua vendo só o próprio cadastro.

drop policy if exists "afiliado lê o próprio cadastro" on public.afiliados;

create policy "afiliado lê o próprio cadastro"
  on public.afiliados
  for select
  to authenticated
  using (
    conta = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Criar pelo e-mail
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_criar_afiliado(p_email text, p_apelido text, p_checkout_basico text DEFAULT ''::text, p_checkout_premium text DEFAULT ''::text, p_valor_basico numeric DEFAULT NULL::numeric, p_valor_premium numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conta uuid;
  v_apelido text := lower(trim(p_apelido));
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores';
  end if;

  -- A mesma regra que a coluna cobra, conferida aqui para a mensagem fazer
  -- sentido: o erro do CHECK fala de expressão regular, e quem está na tela
  -- quer saber o que digitar.
  if v_apelido !~ '^[a-z0-9-]{3,40}$' then
    raise exception 'O código aceita de 3 a 40 letras minúsculas, números e hífen.';
  end if;

  select u.id into v_conta
  from auth.users u
  where lower(u.email) = lower(trim(p_email));

  if v_conta is null then
    raise exception 'Nenhuma conta com esse e-mail. A pessoa precisa se cadastrar na FORNEXA antes.';
  end if;

  if exists (select 1 from public.afiliados a where a.conta = v_conta) then
    raise exception 'Essa conta já está no programa de afiliados.';
  end if;

  if exists (select 1 from public.afiliados a where a.apelido = v_apelido) then
    raise exception 'Esse código já é de outro afiliado. Escolha outro.';
  end if;

  insert into public.afiliados (
    conta, apelido, situacao,
    checkout_basico, checkout_premium,
    valor_basico, valor_premium,
    pedido_em, decidido_em, atualizado_em
  )
  values (
    v_conta, v_apelido, 'aprovado',
    coalesce(trim(p_checkout_basico), ''), coalesce(trim(p_checkout_premium), ''),
    p_valor_basico, p_valor_premium,
    now(), now(), now()
  );
end;
$function$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) As duas políticas citam co-produtor:
-- select polname, pg_get_expr(polqual, polrelid) from pg_policy
-- where polrelid = 'public.afiliados'::regclass;

-- (b) E criar afiliado também:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and proname = 'admin_criar_afiliado'
--   and pg_get_functiondef(p.oid) like '%coprodutor%';
