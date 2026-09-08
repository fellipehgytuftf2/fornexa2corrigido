-- A leitura da própria declaração de origem, por função.
--
-- POR QUE
--
-- O vendedor clicava em "Já cadastrei no Mercado Livre", via a confirmação, e
-- ao voltar à tela encontrava o alerta de novo — como se o clique não tivesse
-- valido. Valeu: a linha está gravada. O que falhava era a LEITURA de volta,
-- feita direto na tabela e portanto dependente da política de RLS.
--
-- Tudo o mais nesta parte do sistema já vinha por função `security definer`:
-- `enderecos_dos_meus_fornecedores`, `declarar_origem`, `meus_avisos`. A
-- leitura da declaração ficou de fora por descuido, e foi a única que quebrou.
--
-- Não é a política que está errada — é ter duas portas para o mesmo dado, cada
-- uma com regra própria para manter em dia. Uma porta só.

create or replace function public.minha_origem_declarada()
returns table (
  declarada_em timestamptz,
  confirmada_em timestamptz,
  desmentida_em timestamptz,
  origem_no_envio text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select o.declarada_em, o.confirmada_em, o.desmentida_em, o.origem_no_envio
  from public.origem_declarada o
  where o.user_id = auth.uid();
end;
$$;

grant execute on function public.minha_origem_declarada() to authenticated;
