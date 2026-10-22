-- O endereço do fornecedor aparece antes de a pessoa publicar o primeiro
-- produto.
--
-- POR QUE
--
-- A função só devolvia fornecedor de quem JÁ tinha anúncio publicado. Quem
-- acabou de entrar abria Integrações e não via endereço nenhum — justamente
-- quem mais precisa vê-lo, porque a hora certa de configurar a origem no
-- Mercado Livre é ANTES da primeira venda.
--
-- Depois que a etiqueta é impressa, o Mercado Livre não deixa mais trocar o
-- endereço daquele envio. Então quem descobre isso depois de vender já perdeu
-- a janela, e o pacote sai declarando a casa do vendedor.
--
-- O QUE MUDA
--
-- Sem anúncio publicado, mostra os fornecedores ativos que têm endereço
-- cadastrado — que é de onde as encomendas dele vão sair quando ele publicar.
-- Com anúncio publicado, continua mostrando os fornecedores dele.
--
-- O QUE NÃO MUDA
--
-- Fornecedor sem CEP continua de fora: endereço pela metade no Mercado Livre é
-- pior que endereço nenhum.

create or replace function public.enderecos_dos_meus_fornecedores()
returns table (
  supplier_id uuid,
  fornecedor text,
  cep text,
  logradouro text,
  numero text,
  bairro text,
  complemento text,
  cidade text,
  estado text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tem_anuncio boolean;
begin
  select exists (
    select 1 from public.user_products up where up.user_id = auth.uid()
  ) into v_tem_anuncio;

  return query
  select distinct
    s.id,
    coalesce(nullif(s.company_name, ''), s.name),
    s.cep,
    s.logradouro,
    s.numero,
    s.bairro,
    s.complemento,
    s.city,
    s.state
  from public.suppliers s
  where nullif(btrim(coalesce(s.cep, '')), '') is not null
    and (
      -- Já publicou: os fornecedores dos anúncios dele.
      exists (
        select 1
        from public.user_products up
        where up.supplier_id = s.id
          and up.user_id = auth.uid()
      )
      -- Ainda não publicou: os fornecedores ativos, que é de onde as
      -- encomendas vão sair quando ele publicar.
      or (not v_tem_anuncio and coalesce(s.status, 'active') = 'active')
    );
end;
$$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Quantos fornecedores com endereço existem hoje (o teto do que aparece para
-- quem ainda não publicou):
-- select count(*) from public.suppliers
-- where coalesce(status, 'active') = 'active'
--   and nullif(btrim(coalesce(cep, '')), '') is not null;

-- Quem não veria endereço nenhum hoje — contas sem anúncio, que antes desta
-- migração abriam Integrações e não encontravam o bloco:
-- select count(*) from auth.users u
-- where not exists (select 1 from public.user_products up where up.user_id = u.id);
