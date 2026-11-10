-- ============================================================================
-- O admin cria o afiliado, sem esperar o pedido
-- ============================================================================
--
-- Até aqui só havia um caminho para alguém virar afiliado: a própria pessoa
-- pedia em `pedir_para_ser_afiliado` e o admin aprovava depois. Serve para
-- quem chega sozinho, e é o caminho certo para esse caso.
--
-- Não serve para o contrário: o dono fecha a parceria por fora -- conversa,
-- WhatsApp, combinado em call -- e precisa deixar o afiliado pronto antes de
-- avisar a pessoa. Pelo caminho antigo ele teria de pedir para ela entrar,
-- achar o botão, pedir, e só então aprovar. Três passos do lado de quem não
-- está esperando nada.
--
-- Aqui o admin cria direto, já aprovado, pelo e-mail da conta.
--
-- A CONTA PRECISA EXISTIR ANTES
--
-- O afiliado é uma linha presa a uma conta (`conta` referencia auth.users), e
-- não um cadastro solto. Sem conta não há a quem prender, e inventar uma aqui
-- criaria usuário sem senha, sem e-mail confirmado e sem ninguém do outro
-- lado. Então a pessoa se cadastra normalmente e o admin a torna afiliada.
--
-- OS CHECKOUTS E OS PREÇOS VÊM JUNTO, SE JÁ ESTIVEREM PRONTOS
--
-- Quem fecha a parceria por fora costuma criar os dois checkouts na Applyfy
-- antes de voltar aqui -- os links já estão na mão. Obrigar a criar o
-- afiliado primeiro e colar depois seriam dois passos por nada.
--
-- São opcionais mesmo assim, porque a outra ordem também acontece: o afiliado
-- entra hoje e só abre a conta na Applyfy amanhã. Enquanto os checkouts
-- estiverem vazios, `podeDivulgar` é falso e o link não vende -- a venda cai
-- no checkout da casa em vez de sumir. Melhor do que um link que promete
-- comissão e não paga.
--
-- Preço vazio é o preço da casa, como em qualquer outro lugar desta tabela.

-- Uma versão anterior desta função nasceu só com e-mail e apelido. Some aqui
-- para não ficarem as duas, com o PostgREST escolhendo uma delas.
drop function if exists public.admin_criar_afiliado(text, text);

create or replace function public.admin_criar_afiliado(
  p_email text,
  p_apelido text,
  p_checkout_basico text default '',
  p_checkout_premium text default '',
  p_valor_basico numeric default null,
  p_valor_premium numeric default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conta uuid;
  v_apelido text := lower(trim(p_apelido));
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
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

revoke all on function public.admin_criar_afiliado(text, text, text, text, numeric, numeric) from public;
grant execute on function public.admin_criar_afiliado(text, text, text, text, numeric, numeric) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) A função existe e só o admin executa:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and proname = 'admin_criar_afiliado';

-- (b) Criando um de teste (troque o e-mail por uma conta que exista):
-- select public.admin_criar_afiliado('conta-de-teste@exemplo.com', 'teste-afiliado');

-- (c) E conferindo que nasceu aprovado e sem checkout:
-- select apelido, situacao, checkout_basico, checkout_premium
-- from public.afiliados where apelido = 'teste-afiliado';
