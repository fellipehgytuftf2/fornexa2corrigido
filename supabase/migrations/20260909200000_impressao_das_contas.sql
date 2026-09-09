-- Quem já trocou a impressão para térmica, e quem não.
--
-- POR QUE
--
-- O aviso diz quantos leram. Ler não é resolver: a pessoa fecha a janela, se
-- distrai, e o fornecedor continua cortando folha com tesoura. Sem saber quem
-- resolveu, a cobrança volta a ser repetir o recado para todos — inclusive
-- para quem já fez.
--
-- A preferência é legível pela API (`thermal_printer` em
-- `/users/{id}/shipping_preferences`), mas é uma chamada por vendedor. Guardar
-- o que se leu transforma isso numa lista que se olha à vontade, e a varredura
-- vira coisa de apertar um botão de vez em quando.
--
-- Fica em `ml_connections` porque é característica da CONTA DO MERCADO LIVRE,
-- não da pessoa: trocando a conta conectada, a preferência é outra.

alter table public.ml_connections
  add column if not exists impressao_termica boolean,
  add column if not exists impressao_vista_em timestamptz;

comment on column public.ml_connections.impressao_termica is
  'Se esta conta do Mercado Livre imprime etiqueta em térmica. Nulo = nunca foi conferido. Falso = A4, e o fornecedor corta com tesoura.';

comment on column public.ml_connections.impressao_vista_em is
  'Quando essa leitura foi feita. Valor de semanas atrás diz pouco sobre agora.';


/**
 * Como está a impressão de cada vendedor.
 *
 * Só o que já foi lido: quem nunca foi conferido aparece com nulo, e é isso
 * mesmo — inventar "provavelmente A4" faria a lista mentir.
 */
create or replace function public.admin_impressao_das_contas()
returns table (
  user_id uuid,
  nome text,
  email text,
  empresa text,
  termica boolean,
  vista_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  return query
  select
    c.user_id,
    coalesce(nullif(p.name, ''), u.email::text)::text,
    u.email::text,
    p.empresa::text,
    c.impressao_termica,
    c.impressao_vista_em
  from public.ml_connections c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id
  where c.external_account_id is not null
  -- Quem falta resolver primeiro, quem nunca foi conferido depois, e os
  -- resolvidos por último: a lista existe para agir, não para arquivar.
  order by c.impressao_termica nulls last, c.impressao_vista_em desc nulls last;
end;
$$;

grant execute on function public.admin_impressao_das_contas() to authenticated;
