-- O que voltou e está guardado no CD do fornecedor.
--
-- Devolução por arrependimento não devolve dinheiro: pelas regras da MS
-- Digital, "o produto fica disponível p nova etiqueta". Ou seja, vira crédito
-- em produto, parado no depósito deles, já pago pelo vendedor.
--
-- E some da vista. No Financeiro é uma venda que não vingou; o produto sai dos
-- números e continua existindo. Passa mês, o vendedor esquece, e o crédito
-- vira prejuízo que nunca apareceu em relatório nenhum.
--
-- Esta consulta é o contrário disso: o que está parado, há quanto tempo, e
-- quanto vale.

/**
 * Os produtos do vendedor guardados no CD.
 *
 * "Não chegou" fica de fora porque não existe mais nada para vender. "Avariada"
 * entra, mas marcada: o produto chegou e a embalagem não — quem decide se ainda
 * dá para vender é o fornecedor, e o vendedor precisa falar com ele antes de
 * contar com esse dinheiro.
 */
create or replace function public.meus_produtos_parados()
returns table (
  id uuid,
  produto text,
  imagem text,
  valor numeric,
  motivo text,
  status text,
  codigo_devolucao text,
  parado_desde timestamptz,
  dias_parado integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    d.id,
    o.product_name,
    o.product_image_url,
    coalesce(o.supplier_price, 0),
    d.motivo,
    d.status,
    d.codigo_devolucao,
    coalesce(d.recebida_em, d.avisada_em),
    extract(day from now() - coalesce(d.recebida_em, d.avisada_em))::integer
  from public.devolucoes d
  join public.orders o on o.id = d.order_id
  where d.user_id = auth.uid()
    and d.status in ('recebida', 'avariada')
  order by coalesce(d.recebida_em, d.avisada_em);
end;
$$;

grant execute on function public.meus_produtos_parados() to authenticated;


/**
 * O vendedor tira o produto da lista ao usá-lo de novo.
 *
 * É marcação manual de propósito. O sistema não tem como saber que a etiqueta
 * nova que o vendedor mandou ao fornecedor é justamente daquele produto
 * guardado — quem sabe é ele.
 */
create or replace function public.marcar_devolucao_revendida(p_devolucao uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.devolucoes
  set status = 'revendida', updated_at = now()
  where id = p_devolucao
    and user_id = auth.uid()
    and status in ('recebida', 'avariada');

  if not found then
    raise exception 'devolução não encontrada ou ainda não foi recebida no CD';
  end if;

  return 'revendida';
end;
$$;

grant execute on function public.marcar_devolucao_revendida(uuid) to authenticated;
