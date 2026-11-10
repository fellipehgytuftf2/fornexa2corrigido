-- ============================================================================
-- Preço próprio por afiliado, com o padrão da casa quando vazio
-- ============================================================================
--
-- O preço da landing vinha de um lugar só: `PLANOS`, em src/lib/planos.ts,
-- escrito no código e igual para todo mundo. O checkout, não -- esse já era
-- de cada afiliado, porque a venda cai na conta dele.
--
-- Isso deixava uma folga perigosa: o afiliado monta na Applyfy um checkout de
-- R$ 119, a landing continua anunciando R$ 139, e a pessoa descobre a
-- diferença na hora de pagar. Para menos é desconfiança; para mais é
-- propaganda enganosa.
--
-- Aqui o preço anunciado passa a morar junto do checkout que o cobra.
--
-- VAZIO QUER DIZER PADRÃO, E NÃO ZERO
--
-- Por isso as colunas aceitam nulo em vez de nascerem com o preço de hoje
-- copiado dentro. Afiliado que não mexe no preço acompanha o da casa para
-- sempre, inclusive quando ele mudar -- e um reajuste não precisa passar por
-- linha nenhuma desta tabela. Zero seria um preço, e preço de graça.
--
-- O VALOR É SÓ O QUE SE MOSTRA
--
-- Quem cobra é a Applyfy, pelo link do checkout. Este número não cobra nada:
-- ele é o que a landing escreve na tela. Os dois precisam combinar, e quem
-- garante isso é quem preenche -- o sistema não tem como ler o preço de
-- dentro do checkout do afiliado para conferir.

alter table public.afiliados
  add column if not exists valor_basico numeric(10, 2),
  add column if not exists valor_premium numeric(10, 2);

comment on column public.afiliados.valor_basico is
  'Preço do Básico que a landing deste afiliado mostra. Nulo = o preço da casa.';

comment on column public.afiliados.valor_premium is
  'Preço do Premium que a landing deste afiliado mostra. Nulo = o preço da casa.';

-- Preço negativo ou zero não é desconto, é erro de digitação chegando na
-- landing. O teto alto existe só para barrar o dedo escorregando no zero.
alter table public.afiliados
  drop constraint if exists afiliados_valores_plausiveis;

alter table public.afiliados
  add constraint afiliados_valores_plausiveis check (
    (valor_basico is null or (valor_basico > 0 and valor_basico <= 99999)) and
    (valor_premium is null or (valor_premium > 0 and valor_premium <= 99999))
  );


-- ----------------------------------------------------------------------------
-- A landing passa a receber o preço junto do checkout
-- ----------------------------------------------------------------------------
-- Troca o tipo de retorno, e por isso cai antes de nascer de novo.
--
-- Continua aberta a quem não fez login: é ela que a landing de cada afiliado
-- consulta antes de qualquer cadastro. Só devolve apelido, links e preços de
-- quem está aprovado e com os dois checkouts no lugar -- nada de conta, nome
-- ou e-mail.

drop function if exists public.checkout_do_afiliado(text);

create function public.checkout_do_afiliado(p_codigo text)
returns table(
  apelido text,
  checkout_basico text,
  checkout_premium text,
  valor_basico numeric,
  valor_premium numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.apelido, a.checkout_basico, a.checkout_premium, a.valor_basico, a.valor_premium
  from public.afiliados a
  where a.apelido = lower(trim(coalesce(p_codigo, '')))
    and a.situacao = 'aprovado'
    and a.checkout_basico <> ''
    and a.checkout_premium <> ''
  limit 1;
$function$;


-- ----------------------------------------------------------------------------
-- E a tela do admin passa a enxergar o que está gravado
-- ----------------------------------------------------------------------------
-- Sem isto, os campos de preço abririam sempre em branco e salvar uma vez
-- apagaria o que estava lá.
--
-- A guarda já aceita co-produtor: esta função também é lida pela tela de
-- Desempenho. Se a migration 20261109120000 for aplicada depois desta, ela
-- recria a função sem as colunas novas -- aplique na ordem.

drop function if exists public.admin_afiliados_cadastrados();

create function public.admin_afiliados_cadastrados()
returns table(
  conta uuid,
  apelido text,
  nome text,
  email text,
  situacao text,
  checkout_basico text,
  checkout_premium text,
  pedido_em timestamp with time zone,
  valor_basico numeric,
  valor_premium numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores';
  end if;

  return query
  select
    a.conta,
    a.apelido,
    p.name,
    p.email,
    a.situacao,
    a.checkout_basico,
    a.checkout_premium,
    a.pedido_em,
    a.valor_basico,
    a.valor_premium
  from public.afiliados a
  join public.profiles p on p.id = a.conta
  order by
    -- Quem está esperando decisão aparece primeiro: é o que exige ação.
    case a.situacao when 'pendente' then 0 when 'aprovado' then 1 else 2 end,
    a.pedido_em;
end;
$function$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) As colunas existem e aceitam vazio:
-- select column_name, data_type, is_nullable from information_schema.columns
-- where table_name = 'afiliados' and column_name like 'valor_%';

-- (b) Quem tem preço próprio hoje:
-- select apelido, valor_basico, valor_premium from public.afiliados
-- where valor_basico is not null or valor_premium is not null;

-- (c) A landing de um afiliado recebe os preços (troque o código):
-- select * from public.checkout_do_afiliado('paulo');
