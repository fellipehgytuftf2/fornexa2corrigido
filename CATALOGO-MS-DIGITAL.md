# Sincronização do catálogo MS Digital — o que falta configurar

O código está pronto (`api/ms-digital-sync.js` + `api/_lib/`). Assim como em
[PAGAMENTOS.md](PAGAMENTOS.md), o que falta são passos no painel da Vercel —
nenhum deles dá pra fazer pelo repositório.

## De onde isso veio

Portado do projeto separado `msdigital-scraper`
(github.com/Akira-Ishigami/msdigital-scraper), que já rodava sozinho, uma vez
por dia, escrevendo direto nesta mesma tabela `catalog_products` de produção.
A lógica de extração e gravação é a mesma, só passou a morar dentro do
FORNEXA em vez de um projeto Vercel à parte — mais fácil de manter em um
lugar só.

**Ação necessária:** depois de confirmar que a sincronização daqui está
funcionando, desligue o Cron Job do projeto antigo (`msdigital-scraper` na
Vercel → Settings → Cron Jobs, ou pause/apague o projeto) — caso contrário
os dois vão rodar todo dia e escrever na mesma tabela por duas vezes.

## Como funciona

Duas vezes por dia — 00h e 12h (horário de Brasília) — tenta em ordem:

1. **Login na loja + API interna** — traz o preço real de dropship. Precisa
   de `MSDIGITAL_EMAIL`/`MSDIGITAL_SENHA`. No plano Hobby da Vercel (60s por
   função), medido em produção esse caminho leva 90-105s — por isso desiste
   depois de 40s e cai pro passo 2. Na prática, a maioria das execuções vai
   usar o feed público, e só ocasionalmente o login terminará a tempo.
2. **Feed público** (`catalogo.md`) — sem login, mais rápido, sem preço de
   dropship real (usa `preco_varejo` como aproximação nesse caso).
3. **llms.txt** — último recurso, se os links padrão do site mudarem.

Ao final, grava em `catalog_products` (ver comentário no topo de
`api/_lib/ms-digital/supabase.js` para as regras: casamento por nome dentro
do fornecedor "MS Digital", nunca mexe em `status`, produto sumido do site
vira `indisponivel_no_fornecedor = true` em vez de apagado).

## 1. Confirme que o fornecedor "MS Digital" existe

```sql
select id from suppliers where name = 'MS Digital';
```

Se não existir, a sincronização falha com um erro claro (não cria fornecedor
sozinha, de propósito). Segundo o projeto original, esse cadastro já foi
feito em produção — só confira.

## 2. Variáveis de ambiente no Vercel

No projeto do FORNEXA na Vercel (o mesmo que já hospeda o front-end),
Settings → Environment Variables:

| Variável | Obrigatória? | Descrição |
|---|---|---|
| `SUPABASE_URL` | Sim | URL do projeto Supabase (a mesma do `.env.local`, sem o prefixo `VITE_`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Chave *service role* — **nunca** a `anon`/`publishable`. Esta função grava direto na tabela, sem passar por RLS. |
| `CRON_SECRET` | Sim | Um valor aleatório qualquer. Sem isso, o endpoint só aceita chamadas do próprio Cron da Vercel — nem você consegue testar na mão. |
| `MSDIGITAL_EMAIL` | Para preço real de dropship | E-mail da conta na loja MS Digital |
| `MSDIGITAL_SENHA` | Para preço real de dropship | Senha da conta |

Sem `MSDIGITAL_EMAIL`/`MSDIGITAL_SENHA`, o job pula direto pro feed público
(funciona, só sem o preço real de dropship — usa `preco_varejo` no lugar).

## 3. Testar manualmente

Depois do próximo deploy:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU-DOMINIO/api/ms-digital-sync
```

A resposta traz `etapaUsada` (qual dos três caminhos funcionou),
`totalProdutos`, `tentativas` (o que deu certo/errado em cada etapa) e o
resultado da gravação no Supabase (`criados`, `atualizados`,
`marcados_indisponiveis`, `erros`).

## Agenda

`vercel.json`: `0 3 * * *` e `0 15 * * *` (3h e 15h UTC = 0h e 12h em
Brasília), todo dia. Ajuste editando esse arquivo e reimplantando, se quiser
outro horário.

**Atenção se o projeto estiver no plano Hobby (gratuito) da Vercel:** a
Vercel limita Cron Jobs do plano Hobby a **no máximo uma execução por dia**
— o segundo horário simplesmente não dispara (a Vercel aceita o deploy, mas
ignora o cron extra). Rodar duas vezes por dia de verdade exige o plano Pro
(~$20/mês). Se o projeto já estiver no Hobby e isso não for opção agora, me
avise que eu volto a agenda para uma execução só.

## Diferença em relação ao projeto original

O endpoint agora **exige** `CRON_SECRET` configurado — no projeto original,
sem essa variável o endpoint ficava completamente aberto (qualquer um na
internet podia chamá-lo e forçar gravações na tabela de produção). Aqui, sem
`CRON_SECRET`, só o Cron da própria Vercel consegue chamar.
