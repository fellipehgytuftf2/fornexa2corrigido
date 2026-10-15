# FORNEXA

Plataforma de dropshipping que liga **vendedores do Mercado Livre** a **fornecedores reais**, automatizando o caminho entre a venda e o despacho.

O vendedor escolhe um produto do catálogo, define a margem e publica no Mercado Livre em poucos cliques. Quando a venda acontece, o pedido entra sozinho pelo webhook, o fornecedor recebe no Portal dele com etiqueta e declaração prontas, e o vendedor acompanha pagamento, envio e devolução sem sair do painel.

---

## Índice

- [O que o sistema faz](#o-que-o-sistema-faz)
- [Tecnologias](#tecnologias)
- [Rodando localmente](#rodando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Supabase](#supabase)
- [Deploy na Vercel](#deploy-na-vercel)
- [Rotinas agendadas](#rotinas-agendadas)
- [Convenções do projeto](#convenções-do-projeto)

---

## O que o sistema faz

### Área do vendedor (`/dashboard`)

| Tela | Para quê |
|---|---|
| **Dashboard** | Resumo de vendas, lucro e pedidos do dia |
| **Catálogo** | Produtos reais de fornecedores, com estoque e preço de custo |
| **Meus Anúncios** | O que já foi publicado, com link do anúncio e alerta de venda no prejuízo |
| **Pedidos** | Pagar o fornecedor, acompanhar envio, abrir e acompanhar devolução |
| **Financeiro** | Lucro apurado com taxa e frete reais do Mercado Livre |
| **Integrações** | Conectar a conta do ML, endereço de origem e formato da etiqueta |
| **Chamados / Suporte** | Conversa com o fornecedor (por pedido) e com a equipe FORNEXA |
| **Configurações** | Perfil, WhatsApp, DC-e automática, nicho do catálogo |

### Portal do fornecedor (`/fornecedor`)

Área separada, com login próprio. Um cartão por envio (carrinho agrupado), etiqueta e DACE para baixar — inclusive em lote —, controle de reserva e separação, devoluções com código de autorização, e estoque.

### Área administrativa (`/dashboard/admin/*`)

Gestão do catálogo, repasses, afiliados, avisos, contas, kanban e uma tela de **saúde operacional** com sondas de diagnóstico (impressão, pausas por estoque, remetente travado, vendas no vermelho, "onde está este pedido", reclamações e nota fiscal PJ).

### Automações

- Pedido do Mercado Livre entra sozinho pelo webhook (`orders_v2` e `shipments`)
- Declaração de Conteúdo (DC-e) emitida automaticamente na venda
- Anúncio pausado quando o fornecedor fica sem estoque, e reativado quando volta
- Devolução aberta sozinha quando o pacote volta ou a venda despachada é cancelada
- Catálogo da MS Digital sincronizado duas vezes por dia
- Avisos diários: produtos novos no catálogo, cobrança do código de devolução

---

## Tecnologias

**Front-end**
- React 18 + TypeScript
- Vite 5
- Tailwind CSS 3 (modo escuro por classe)
- React Router 7
- Recharts, Framer Motion, dnd-kit, lucide-react

**Back-end**
- **Supabase** — Postgres com RLS, funções `SECURITY DEFINER`, views, triggers, Storage, Auth e Edge Functions em Deno
- **Vercel** — hospedagem do front, funções serverless em `api/` e Cron Jobs
- **GitHub** — repositório; o push na `main` dispara o deploy na Vercel

**Integração externa**
- API oficial do Mercado Livre (OAuth, publicação, pedidos, envios, etiquetas, DC-e, taxas)

---

## Rodando localmente

Requisitos: **Node 24.x** (definido em `engines`) e npm.

```bash
git clone <url-do-repositorio>
cd fornexa
npm install

cp .env.example .env.local   # preencha os valores
npm run dev                  # http://localhost:5173
```

Outros comandos:

```bash
npm run build       # build de produção
npm run preview     # serve o build localmente
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit -p tsconfig.app.json
```

O front local aponta para o Supabase de produção definido em `.env.local`. Não existe banco local neste projeto — ver [Supabase](#supabase).

---

## Variáveis de ambiente

Só os nomes. Os valores ficam em `.env.local` (ignorado pelo git), no painel da Vercel e nos *secrets* do Supabase.

### Front-end — `.env.local` e Vercel

| Nome | Para quê |
|---|---|
| `VITE_SUPABASE_URL` | Endereço do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública (substitui a antiga `anon`) |

### Funções serverless da Vercel — `api/`

| Nome | Para quê |
|---|---|
| `SUPABASE_URL` | Endereço do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço, para gravar no catálogo |
| `CRON_SECRET` | Autoriza a chamada do Cron Job |
| `MSDIGITAL_EMAIL` | Login na loja do fornecedor (preço de dropship) |
| `MSDIGITAL_SENHA` | Senha do login acima |

### Edge Functions — secrets do Supabase

| Nome | Para quê |
|---|---|
| `SUPABASE_URL` | Endereço do projeto |
| `SUPABASE_PUBLISHABLE_KEYS` | Chaves públicas no formato novo (JSON) |
| `SUPABASE_SECRET_KEYS` | Chaves de serviço no formato novo (JSON) |
| `SUPABASE_ANON_KEY` | Chave pública legada (reserva) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço legada (reserva) |
| `ML_CLIENT_ID` | Aplicação no Mercado Livre |
| `ML_CLIENT_SECRET` | Segredo da aplicação |
| `ML_REDIRECT_URI` | Endereço de retorno do OAuth |
| `ML_WEBHOOK_SECRET` | Confere a origem dos avisos do ML |
| `FRONTEND_URL` | Para onde o OAuth devolve a pessoa |
| `APPLYFY_WEBHOOK_TOKEN` | Autentica o webhook de pagamento |
| `APPLYFY_OFERTA_BASICO` | Identificador da oferta do plano básico |
| `APPLYFY_OFERTA_PREMIUM` | Identificador da oferta do plano premium |
| `PIX_WEBHOOK_SEGREDO` | Autentica o aviso de Pix recebido |

> **Sobre as chaves do Supabase:** o projeto lê primeiro as chaves novas (`sb_publishable_…` / `sb_secret_…`, guardadas em JSON nas variáveis plurais) e cai nas legadas quando elas não existem. O módulo `supabase/functions/_shared/chaves.ts` explica o porquê — o mesmo código roda antes e depois de as legadas serem desativadas.

---

## Estrutura de pastas

```
.
├── api/                         Funções serverless da Vercel
│   ├── ms-digital-sync.js       Sincroniza o catálogo do fornecedor (cron)
│   └── _lib/ms-digital/         Login, feed público e gravação no Supabase
│
├── src/
│   ├── main.tsx                 Entrada da aplicação
│   ├── App.tsx                  Rotas
│   ├── layouts/
│   │   └── DashboardLayout.tsx  Menu, cabeçalho e proteção de rota
│   ├── pages/
│   │   ├── LandingPage.tsx      Página pública
│   │   ├── Login / Register / Assinar / Esqueci-Redefinir senha
│   │   ├── SupplierLogin.tsx    Entrada do Portal do Fornecedor
│   │   ├── dashboard/           Telas do vendedor e do admin
│   │   └── supplier/            Portal do Fornecedor
│   ├── components/
│   │   ├── dashboard/           Componentes das telas do painel
│   │   ├── supplier/            Componentes do Portal
│   │   ├── landing/             Hero, planos, benefícios, CTA
│   │   ├── conquistas/          Selos, ranking e Top Vendedores
│   │   └── ui/                  Toast, paginação, modal, badges
│   ├── lib/                     Supabase, taxas do ML, afiliados, planos,
│   │                            feature flags, Pix, horário de corte
│   ├── data/  types/            Dados estáticos e tipos compartilhados
│   └── index.css                Tailwind e estilos globais
│
├── supabase/
│   ├── migrations/              ~145 migrações SQL, em ordem cronológica
│   ├── functions/               ~34 Edge Functions (Deno)
│   │   ├── _shared/             Chaves, token do ML, emissão de DC-e
│   │   ├── ml-*                 Integração com o Mercado Livre
│   │   ├── supplier-*           Portal do Fornecedor
│   │   ├── admin-*              Ferramentas de suporte e diagnóstico
│   │   └── applyfy-webhook, pix-recebido, comprovante-link
│   └── testes/                  Scripts de verificação
│
├── vercel.json                  Rewrites de SPA, crons e limites de função
├── tailwind.config.js           Paleta (navy, gold) e modo escuro
└── vite.config.ts
```

---

## Supabase

### Migrações

As migrações vivem em `supabase/migrations/`, nomeadas por data (`AAAAMMDDHHMMSS_descricao.sql`). Cada arquivo começa com um comentário explicando **por que** aquela mudança existe, e termina com uma seção `VERIFICAÇÃO` — consultas comentadas para conferir o resultado depois de aplicar.

**Como aplicar:** colando o conteúdo no **SQL Editor** do painel do Supabase.

> O SQL Editor roda tudo em **uma transação**: qualquer erro desfaz o arquivo inteiro. Duas armadilhas recorrentes:
>
> - `create or replace function` não muda as colunas de retorno — é preciso `drop function if exists ...(assinatura)` antes (erro `42P13`)
> - `public.profiles` e `public.suppliers` são concedidas **coluna a coluna** para `authenticated`; coluna nova sem `grant select (coluna)` derruba a tela inteira com *permission denied*

### Edge Functions

```bash
npx supabase functions deploy <nome> --project-ref <ref-do-projeto>
```

O deploy é independente do deploy da Vercel: a função sobe na hora, sem esperar build.

Quando outra pessoa também trabalha no repositório, rode `git fetch` antes — a função publicada é a do disco, não a do GitHub.

### Autenticação e papéis

- **Vendedor** — conta comum, `profiles.role = 'user'`
- **Admin** — `profiles.role = 'admin'`, enxerga as telas `/dashboard/admin/*`
- **Fornecedor** — entra pelo `/fornecedor`, ligado a `suppliers.auth_user_id`; o acesso dele é lido por `public.current_supplier_id()`

Quase nada é lido por tabela direta: o Portal do Fornecedor passa por uma view (`pedidos_do_fornecedor`) e por funções `SECURITY DEFINER`. Uma porta só, com uma regra só.

---

## Deploy na Vercel

O projeto é um SPA em Vite mais funções serverless em `api/`.

1. Importe o repositório na Vercel
2. **Framework preset:** Vite · **Build:** `npm run build` · **Output:** `dist`
3. **Node version:** 24.x (o `package.json` já declara em `engines`)
4. Cadastre as variáveis do front (`VITE_*`) e as de `api/` em *Settings → Environment Variables*
5. Aponte o domínio (hoje `fornexa.site`, com DNS na Hostinger)

O `vercel.json` já cuida de três coisas:

- **Rewrites** — todo caminho cai em `index.html`, para o React Router funcionar em link direto
- **Crons** — `/api/ms-digital-sync` às 03:00 e 15:00 UTC
- **Limites** — `maxDuration` de 60s para a sincronização do catálogo

Cada push na `main` dispara um deploy.

---

## Rotinas agendadas

| Onde | Quando | O que faz |
|---|---|---|
| Vercel Cron | 03:00 e 15:00 UTC | Sincroniza o catálogo da MS Digital (preço, estoque, imagens) |
| `pg_cron` | 08:00 UTC | Renova conexões do Mercado Livre que caíram |
| `pg_cron` | 11:00 UTC | Cobra o código de devolução de quem tem pacote voltando |
| `pg_cron` | 12:00 UTC | Avisa assinantes sobre produtos novos no catálogo |

Os agendamentos do banco ficam visíveis em `cron.job`:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

---

## Convenções do projeto

**Comentários explicam o porquê, não o quê.** Boa parte do código carrega o motivo da decisão, o problema real que a causou e, quando existe, o que já foi tentado e não funcionou. Antes de mudar uma regra que parece estranha, leia o comentário acima dela — normalmente ele descreve o prejuízo que aquela estranheza evita.

**Nada de número inventado com cara de cálculo.** Estimativa aparece como estimativa, e quando existe resposta oficial da API ela vem antes do palpite.

**Idioma.** Interface, comentários e mensagens de commit em português. Nomes de API, campos do banco e termos técnicos ficam como estão.

**Verificação antes de publicar:**

```bash
npm run typecheck && npm run lint && npm run build
```
