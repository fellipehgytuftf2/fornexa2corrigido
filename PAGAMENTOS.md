# Planos e pagamentos — o que falta configurar

O código está pronto. O que resta são passos no painel da Applyfy, do Supabase
e da Vercel — nenhum deles dá para fazer pelo repositório.

Faça na ordem. Cada passo depende do anterior.

---

## 1. Aplicar a migração no banco

Abra o SQL Editor do Supabase e rode o conteúdo de
`supabase/migrations/20260802120000_planos_e_pagamentos.sql`.

**O que ela faz com quem já usa o sistema:** toda conta existente vira
`plan_status = 'ativo'`, `plan_origem = 'cortesia'`, sem data de expiração.
Ninguém é trancado do lado de fora por causa desta mudança — nem você.

Confira depois:

```sql
select email, plan, plan_status, plan_origem from profiles;
```

Todas devem estar em `ativo`.

---

## 2. Criar os dois produtos na Applyfy

No painel `app.applyfy.com.br`, crie:

| Produto | Preço | Cobrança |
|---|---|---|
| FORNEXA Básico | R$ 139,00 | mensal, recorrente |
| FORNEXA Premium | R$ 229,00 | pagamento único |

**Na configuração de cada produto, aponte a página de obrigado para:**

```
https://fornexa.site/register
```

Isso é o que fecha o ciclo: a pessoa paga, cai no cadastro, cria a conta com o
mesmo e-mail da compra, e o sistema reconhece o pagamento sozinho.

Anote o **identificador de cada produto** — vai no passo 4.

---

## 3. Colocar os links de checkout no site

Copie o link de checkout de cada produto e coloque em dois lugares:

**No `.env.local`** (para testar na sua máquina):

```
VITE_CHECKOUT_BASICO=https://...
VITE_CHECKOUT_PREMIUM=https://...
```

**Na Vercel**, em Settings → Environment Variables, as mesmas duas.
Depois de salvar, faça um novo deploy — variável nova só entra em build novo.

Enquanto estiverem vazias, os botões da landing levam para `/register` e a tela
de planos mostra "Checkout ainda não configurado". Nada quebra.

---

## 4. Segredos no Supabase

Em Edge Functions → Secrets, adicione três:

| Segredo | Valor |
|---|---|
| `APPLYFY_WEBHOOK_TOKEN` | uma senha longa inventada por você |
| `APPLYFY_PRODUTO_BASICO` | o identificador do produto Básico |
| `APPLYFY_PRODUTO_PREMIUM` | o identificador do produto Premium |

A senha do webhook é o que impede qualquer pessoa na internet de liberar acesso
pago mandando um POST. Sem ela configurada, a função **recusa tudo** — falha
fechada de propósito.

---

## 5. Publicar a função

```
npx supabase functions deploy applyfy-webhook --project-ref qsldlfuajwkmelrbpern --no-verify-jwt
```

O `--no-verify-jwt` é obrigatório: quem chama é a Applyfy, que não tem token de
usuário nenhum. Sem isso o Supabase bloqueia antes de a chamada chegar no
código.

---

## 6. Cadastrar o webhook na Applyfy

Procure no painel por **Webhook**, **Postback** ou **Integrações**. Cadastre:

```
https://qsldlfuajwkmelrbpern.supabase.co/functions/v1/applyfy-webhook?token=SUA_SENHA
```

Marque os eventos de compra aprovada, reembolso e cancelamento, se ela deixar
escolher.

**Se o painel não tiver essa opção**, fale com o suporte deles pelo WhatsApp e
pergunte: *"vocês têm webhook ou postback para avisar meu sistema quando uma
venda é aprovada?"*. Sem isso, o acesso não libera sozinho — teria que ser na
mão pela tela de Assinaturas no Admin, o que funciona mas não escala.

---

## 7. Fazer uma compra de teste

Compre o Básico com um e-mail que ainda não tem conta. Depois rode:

```sql
select email, status, plano, valor, evento, payload
from pagamentos
order by criado_em desc
limit 5;
```

**É aqui que a parte incerta se resolve.** A Applyfy não publica documentação de
webhook, então a função foi escrita para procurar cada informação numa lista de
nomes prováveis e guardar o aviso cru em `payload`. Duas saídas possíveis:

- **`status = 'pago'` e `plano` preenchido** — acertou de primeira, está pronto.
- **`status = 'desconhecido'` ou `plano` vazio** — me mande o conteúdo de
  `payload` e eu ajusto o mapeamento. É questão de minutos, porque o formato
  real estará ali na sua frente.

---

## O que já funciona sem depender de nada acima

- Conta sem plano em dia não entra no painel: cai em `/planos`.
- Admin nunca é bloqueado, para não haver como se trancar para fora.
- Pagamento que chega antes de a conta existir fica guardado e é reivindicado no
  cadastro.
- Aviso repetido não processa duas vezes.
- Tela de Assinaturas no Admin libera, bloqueia e ajusta validade na mão.
