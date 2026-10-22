-- Uma conta do Mercado Livre só pode estar ligada a uma conta do FORNEXA.
--
-- POR QUE
--
-- Levantamento em 22/09/2026:
--
--   conta ML 476651130  -> Teodoro (admin, 73 anúncios)
--                          alves (69 anúncios)
--                          matheus favero (1 anúncio, conectou às 03:46)
--   conta ML 2133676217 -> Jean conta 2
--                          Alcione
--
-- Todas premium ativas. 143 anúncios publicados sob a mesma conta do Mercado
-- Livre por três pessoas diferentes.
--
-- Isso quebra o recebimento de venda. O ml-webhook-receiver acha o vendedor
-- assim:
--
--   .eq("external_account_id", ml_user_id).maybeSingle()
--
-- `maybeSingle()` devolve ERRO quando encontra mais de uma linha. Na primeira
-- venda de qualquer uma dessas contas, o webhook falha e o pedido não entra —
-- com a mensagem enganosa de "Nenhuma conexão FORNEXA encontrada", quando na
-- verdade existem três.
--
-- E não dá para o sistema escolher sozinho de quem é a venda.
--
-- O ml-oauth-callback já passou a barrar isso na hora de conectar. Este índice
-- é a trava no banco, para nenhum outro caminho furar a regra.
--
-- ============================================================================
-- ATENÇÃO — RESOLVA OS DUPLICADOS ANTES DE RODAR
-- ============================================================================
--
-- O índice é único: se ainda houver duplicado, o comando falha (e não estraga
-- nada, só não aplica). Primeiro veja quem são:
--
--   select m.external_account_id, p.name, p.role, m.status, m.created_at,
--          (select count(*) from public.user_products up
--            where up.user_id = m.user_id and up.ml_item_id is not null) as anuncios
--   from public.ml_connections m
--   left join public.profiles p on p.id = m.user_id
--   where m.external_account_id in (
--     select external_account_id from public.ml_connections
--     where coalesce(external_account_id, '') <> ''
--     group by 1 having count(*) > 1
--   )
--   order by m.external_account_id, anuncios desc;
--
-- Decida quem fica com cada conta do Mercado Livre — o critério natural é
-- quem tem os anúncios — e desconecte os outros pelo id da LINHA:
--
--   update public.ml_connections
--      set status = 'disconnected', external_account_id = ''
--    where id = '<id da linha que sai>';
--
-- Não apague a linha: o refresh token dela some junto, e se a pessoa tiver que
-- voltar, volta pelo fluxo normal de conectar.

create unique index if not exists ml_connections_external_account_id_idx
  on public.ml_connections (external_account_id)
  where external_account_id is not null and external_account_id <> '';

comment on index public.ml_connections_external_account_id_idx is
  'Uma conta do Mercado Livre por conta do FORNEXA. Parcial porque conexão desconectada fica com external_account_id vazio, e vazio se repete à vontade — ver migração 20260922060000.';


-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira os resultados
-- ============================================================================

-- (a) Não pode sobrar nenhuma conta do ML em mais de uma conta do FORNEXA.
--     Precisa vir VAZIO.
-- select external_account_id, count(*)
-- from public.ml_connections
-- where coalesce(external_account_id, '') <> ''
-- group by 1 having count(*) > 1;

-- (b) O índice existe?
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'ml_connections'
--   and indexname = 'ml_connections_external_account_id_idx';
