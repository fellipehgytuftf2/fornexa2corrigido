-- O admin lê e corrige o perfil de um cliente.
--
-- POR QUE
--
-- Nome, loja e WhatsApp aparecem em todo pedido que chega ao fornecedor. Quando
-- vêm errados — WhatsApp com dígito a menos, nome da loja escrito de qualquer
-- jeito —, quem sofre é o fornecedor, que não consegue achar o vendedor, e o
-- vendedor não descobre sozinho que o problema é esse.
--
-- Até agora o suporte só podia pedir para a pessoa arrumar, e ela some no meio
-- do caminho. Uma conversa de suporte serve para descobrir o erro; corrigir
-- ali mesmo é o que a encerra.
--
-- O QUE NÃO ENTRA AQUI
--
-- E-mail e senha ficam de fora. E-mail é a chave de entrada e exige confirmação
-- nos dois endereços; senha ninguém deve poder trocar pelo outro, nem o admin —
-- é o que separa "dar suporte" de "entrar como se fosse ele". Para entrar na
-- conta existe `admin-entrar-como`, que é explícito e registrado.
--
-- Plano também não: já tem `admin_define_plano`, com regra própria.

create or replace function public.admin_perfil_do_usuario(p_user_id uuid)
returns table (
  user_id uuid,
  nome text,
  email text,
  empresa text,
  whatsapp text,
  papel text,
  plano text,
  plano_status text,
  criado_em timestamptz
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
    u.id,
    p.name::text,
    u.email::text,
    p.empresa::text,
    p.whatsapp::text,
    coalesce(p.role, 'user')::text,
    p.plan::text,
    p.plan_status::text,
    u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
end;
$$;

grant execute on function public.admin_perfil_do_usuario(uuid) to authenticated;


/** O admin corrige os dados que o fornecedor vê. */
create or replace function public.admin_atualiza_perfil(
  p_user_id uuid,
  p_nome text,
  p_empresa text,
  p_whatsapp text
)
returns jsonb
language plpgsql
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

  if coalesce(btrim(p_nome), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'O nome não pode ficar vazio.');
  end if;

  update public.profiles
  set name = btrim(p_nome),
      empresa = nullif(btrim(coalesce(p_empresa, '')), ''),
      whatsapp = nullif(btrim(coalesce(p_whatsapp, '')), '')
  where id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Perfil não encontrado.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_atualiza_perfil(uuid, text, text, text) to authenticated;
