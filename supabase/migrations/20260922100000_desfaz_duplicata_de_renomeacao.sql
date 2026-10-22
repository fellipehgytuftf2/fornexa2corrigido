-- Desfaz as duplicatas que a rodada de 22/09 criou por renomeação.
--
-- O QUE ACONTECEU
--
-- Na primeira rodada depois da migração 20260921140000, a coluna
-- `fornecedor_produto_id` ainda estava VAZIA em todas as linhas. Sem id, o
-- casamento produto-do-site x linha-do-banco caiu no nome — e a MS Digital
-- tinha acabado de limpar espaços duplos de vários nomes:
--
--   antes:  '6 Pilhas Baterias  Para Aparelho Auditivo'   (dois espaços)
--   agora:  '6 Pilhas Baterias Para Aparelho Auditivo'    (um espaço)
--
-- Nome diferente = produto novo. A rodada criou 53 linhas, e **34 delas são o
-- mesmo produto de sempre**, agora sem preço de custo (R$ 0,00) e ao lado do
-- original. É isso que o fornecedor está vendo como "produtos com preço
-- zerado" e "duplicado" no Portal.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
-- Para cada um dos 34 pares: apaga a linha nova e passa para a linha ORIGINAL
-- o que veio do site (id do produto, nome novo, estoque e disponibilidade).
-- Fica a linha original — que tem o preço de custo real, o histórico e as
-- ligações com anúncios de vendedor.
--
-- Conferido antes de escrever: nenhuma das 34 linhas novas está referenciada
-- em `user_products` (0 linhas), então apagar não quebra anúncio de ninguém.
--
-- O DELETE vem ANTES do UPDATE de propósito: o índice único
-- (supplier_id, fornecedor_produto_id) não aceita as duas linhas com o mesmo
-- id do site nem por um instante.
--
-- Os outros 19 produtos criados são novos de verdade e continuam inativos,
-- esperando preço de custo — ver [[fornexa-pendencias-do-catalogo]].

begin;

-- 1. Fora as duplicatas
delete from public.catalog_products
 where id in (
   '26a9232f-47ab-4aab-ba43-a1b394486580',
   'f673c7a3-a9a0-4020-b369-e255b2b4bad5',
   '4a49a36d-c738-48c3-b318-8874e0a3b895',
   'f819ad27-f024-454c-9866-c3cbf87982f2',
   '7104fcf6-89ff-457f-810b-522ada5ee7f3',
   'b1f76c8b-bfef-4d4d-b4f0-0e72da19f068',
   'e1c4064b-ee8f-4355-963d-0c4350f1ff86',
   '423ebb41-0916-4b83-9113-9703f03b445f',
   '15409d89-f954-4993-8d4f-547680b8d583',
   '27c900a1-e360-48b5-890a-f70ec833c724',
   '4b89e928-fe89-4aed-a40c-4bd6c705abd0',
   '21d06428-3361-4bdb-a0d2-5627810460f5',
   '56009364-8292-4a5a-8812-8692a3c1b1a3',
   '49bd9b0a-da25-481f-a287-d9bd6a3f1f9d',
   'd08e7836-cc73-4dc2-be04-ec0c9db96d4d',
   'e9010379-fb02-4965-95ec-15fea9c51534',
   '5a201388-d196-48a9-9417-069965a56abb',
   '0d12d2d9-8e77-4e3a-8d5a-efd38b23b3a9',
   '46618140-dee6-4dad-aaf1-09c59393702e',
   'd85b1820-c442-4ad1-a4a9-c2ea3406ddc3',
   'dc6d94d5-5b97-4f93-8fe1-b21c68570b7c',
   '5bc305ff-a005-4d68-be3d-d743989eb775',
   '45ba85f0-839d-42e2-a2cf-80b69a5cd58c',
   'bf268504-9260-4add-8ba7-17b067ed730f',
   '9b89ad23-3716-402b-be68-bb1fe8b2185b',
   '8b940e5f-a80c-4a54-bf66-b876b8101983',
   '98862365-311a-4627-aeb6-01f256cdcfce',
   '2a07a420-2562-40f3-ba18-8704bcb08f5b',
   'cb2c152a-7945-41a6-b475-9c5a062191ba',
   '9fa57924-3961-4ecd-bd64-1c80b8c95b91',
   'f8031be1-7794-4b9a-a923-b00b1504f999',
   'dbe77872-8b63-4f56-9343-ecdf85bf2ffb',
   '38233c8f-3b87-4a35-adf9-c492dc674846',
   '630551a5-d2c5-402a-bd7c-c352f7178cb0'
 );

-- 2. O que era delas passa para a linha original
update public.catalog_products c
   set fornecedor_produto_id = v.id_site,
       name = v.nome,
       stock = v.estoque,
       indisponivel_no_fornecedor = v.indisp,
       updated_at = now()
  from (values
    ('b943f4f6-0a4a-4c1b-abe2-cc3615e1687e'::uuid, '2952872', 'Lanterna Profissional Tática Led T6 Recarregável Usb Cor Da Lanterna Preto Cor Da Luz Branco', 12, false),
    ('fca3d538-2dd5-4d11-9095-cf04b85baf15'::uuid, '2948074', 'Organizador De Mala Bolsas De Viagem Necessaire 7', 98, false),
    ('cd126f59-4188-48de-b089-27fced53129a'::uuid, '2944916', 'Chaveiro Silicone Novidade Bonitos De Desenhos Animados Tom and Jerry', 100, false),
    ('4df1b6b9-c763-4b33-99be-3daccaf80600'::uuid, '2944826', 'Chaveiro Silicone Novidade Bonitos De Desenhos Animados Sonic', 100, false),
    ('e7470ec4-2819-4d1a-add9-cf406f3fd06f'::uuid, '2944788', 'Kit Churrasco Aço Inox Faca E Garfo 2 Peças', 100, false),
    ('1f4f096b-3ebf-4c9e-a27d-bfcb340efe59'::uuid, '2943975', 'Fone de Ouvido Bluetooth sem fio tws visor tela touch', 93, false),
    ('ec55d3ee-7007-4589-905b-7a5401036183'::uuid, '2943893', 'Kit 5 Potes Mantimento Cozinha Hermetico C/ Tampa', 0, true),
    ('c066c591-830c-47bc-a0aa-81c670933f3d'::uuid, '2942665', 'Kit 5 Saquinhos Para Lavar Roupas Delicadas Sacos Com Ziper', 0, true),
    ('632d04e3-bb2b-42ff-a144-8108d857e665'::uuid, '2936262', 'Suporte Celular Câmera Aluminio para Moto e Bike', 0, true),
    ('b8038c4f-e1d8-4d8f-9ede-ae54e95075b9'::uuid, '2943674', 'Fone De Ouvido Sem Fio Bluetooth 5.3 Personagens Humor', 63, false),
    ('a2b03046-ad21-43a8-b873-1bb63a243a60'::uuid, '2939762', 'Kit 5 Pcs Espátula Desmontar Painel Moldura Portas Carros', 84, false),
    ('2b73bc28-adb4-41e1-9ba5-72f5d22b9214'::uuid, '2939714', 'Boneca Com Acessórios Sweel Girl e Filha', 98, false),
    ('53485a08-186b-4146-8ade-0a6af3fc9589'::uuid, '2938259', 'Mini Ventilador Soprador Turbo Portátil Mxb-100', 28, false),
    ('980fb34d-e265-426d-831e-0b0daa932504'::uuid, '2937512', 'Depilador Eletrico 4 in 1 Feminino Aparador De Pelos Intimos', 92, false),
    ('be68bcdf-be4b-4291-89ae-3c9e32361c89'::uuid, '2937463', 'Mini Tripe Suporte Para Celular Universal', 34, false),
    ('c7d7912e-0363-4ffa-8d07-230b6f372882'::uuid, '2937034', '6 Pilhas Baterias Para Aparelho Auditivo', 42, false),
    ('eff08240-24a6-4351-95fd-0bebd0359517'::uuid, '2935583', 'Kit Raspador Calafetar Acabamento E Remover Rejunte Alvenaria e Acabamento', 50, false),
    ('c815a52d-8501-454b-9295-ca57c9660ad5'::uuid, '2938077', 'Trena Laser Digital De Alta Precisão Profissional 40m', 0, true),
    ('7f46c232-3a8d-49e5-89df-1151762b6916'::uuid, '2953774', 'Caixa De Som Caminhão Portátil Ws-X691 Usb Bluetooth Sd Fm', 0, true),
    ('dcb94de2-5eb6-4e8a-8905-16043dc86bb6'::uuid, '2953122', 'Projetor De Luzes Estrelas Galáxia Capsula Astronauta Com Controle', 0, true),
    ('0d334dc0-8ed8-4f31-9071-0cbd9f246502'::uuid, '2950201', 'Fone Bluetooth Open Ear original Esportivo Para Ciclista Sport', 0, true),
    ('65f242cf-dbad-4fc6-82ec-a591e0618f6a'::uuid, '2949937', 'Escova De Aço Mola Limpa Grelha Churrasqueira', 0, true),
    ('135b86cf-1816-4823-bb4c-e12239777976'::uuid, '2949184', 'Babá Eletrônica Câmera Sem Fio Visão Noturna Lcd Digital 2.4P 110v/220v', 0, true),
    ('1636b257-a8f3-4c04-94be-3b695ab6ea0b'::uuid, '2948978', 'Caixa De Som Bluetooth Boombox 30cm Potente', 0, true),
    ('70d9f983-6819-4f98-b36d-1505baf01c4e'::uuid, '2945011', 'Mop Lava e Seca com Refil Extra de Microfibra 360 graus', 0, true),
    ('2246e795-dede-41c1-91a5-e526a45b34df'::uuid, '2944917', 'Chaveiro Silicone Novidade Bonitos De Desenhos Animados Mickey and Minnie', 0, true),
    ('bd860687-009b-4f15-988c-a16924729b6a'::uuid, '2938258', 'Jogo Quebra Ovo Solta Pintinho Grande Espadas', 0, true),
    ('9c118589-7e36-447d-990a-734c062bd66c'::uuid, '2937478', 'Radio Vintage Retrô Recarregável Am Fm Sw Usb Mp3 110v/220v', 0, true),
    ('062481b7-f55a-45db-a47f-c2c49f4f8136'::uuid, '2937475', 'Rádio 4 Bandas Com Relógio Lanterna Solar Portátil', 0, true),
    ('b540806a-3287-484f-99a2-663609fa83c5'::uuid, '2937239', 'Relógio De Parede Led Digital Termômetro Recepção', 0, true),
    ('ed548ecc-0fc2-42ca-ae88-ba4111502ea7'::uuid, '2937235', 'Cartao De Memoria 32gb Memory Card Classe 10 3 Em 1', 0, true),
    ('d04b88b0-39d0-4553-a6c0-42d96e305bf9'::uuid, '2936968', 'Maquininha De Cortar Cabelo Barbeador Aparador De Pelos Acabamento', 0, true),
    ('1aee39fe-06b9-488c-97e7-c33463c6d7c1'::uuid, '2936534', 'Kit 2 Colher Para Mexer Suco 30 Cm Leite Copo Jarra Comprida Aço Inox', 0, true),
    ('404be82d-bad1-4ddb-a36e-ba9fdfb61757'::uuid, '2935568', 'Kit Reparo Pneus Sem Câmara Carros E Motos', 0, true)
  ) as v(id, id_site, nome, estoque, indisp)
 where c.id = v.id;

commit;


-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira os resultados
-- ============================================================================

-- (a) Produtos com preço zerado: cai de 53 para 19.
-- select count(*) from public.catalog_products
-- where supplier_id = (select id from public.suppliers where name = 'MS Digital')
--   and coalesce(supplier_price, 0) = 0;

-- (b) Nenhum nome duplicado depois de normalizar espaço e caixa.
-- select lower(regexp_replace(name, '\s+', ' ', 'g')) as nome, count(*)
-- from public.catalog_products
-- where supplier_id = (select id from public.suppliers where name = 'MS Digital')
-- group by 1 having count(*) > 1;

-- (c) Todo produto que veio do site tem id agora.
-- select count(*) filter (where fornecedor_produto_id is null) as sem_id,
--        count(*) as total
-- from public.catalog_products
-- where supplier_id = (select id from public.suppliers where name = 'MS Digital');
