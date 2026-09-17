/**
 * Planos, preços e a regra de quem pode entrar.
 *
 * Um arquivo só para a landing, o painel e o guarda de rota concordarem. Preço
 * escrito em dois lugares vira preço errado em um deles.
 */

export type StatusPlano =
  | 'inativo'
  | 'ativo'
  | 'vencido'
  | 'cancelado'
  | 'reembolsado';

export interface PerfilDePlano {
  plan?: string | null;
  plan_status?: string | null;
  plan_expira_em?: string | null;
  role?: string | null;
}

export interface Plano {
  id: 'basico' | 'premium';
  nome: string;
  preco: string;
  precoAntigo?: string;
  periodo: string;
  destaque?: string;
  chamada: string;
  beneficios: string[];
  /** Endereço do checkout na Applyfy. Vem do ambiente. */
  checkout: string;
}

const checkoutBasico = import.meta.env.VITE_CHECKOUT_BASICO || '';
const checkoutPremium = import.meta.env.VITE_CHECKOUT_PREMIUM || '';

/**
 * Os dois planos dão o MESMO acesso. A diferença é só a forma de pagar.
 *
 * Isto está escrito aqui porque a versão anterior desta lista prometia coisas
 * que o sistema não entregava: "catálogo completo" só no Premium, quando o
 * Básico também vê tudo; "ferramentas premium", numa aba que foi removida do
 * menu; "suporte prioritário", sem nenhum mecanismo de prioridade. Vender
 * diferença que não existe rende reclamação com razão — e no Brasil é
 * propaganda enganosa, não só cliente insatisfeito.
 *
 * Se um dia os planos passarem a se distinguir de verdade, o lugar de começar
 * é aqui: mudar o texto junto com o código que cria a distinção, nunca antes.
 */
export const PLANOS: Plano[] = [
  {
    id: 'basico',
    nome: 'Plano Básico',
    preco: 'R$ 139,00',
    periodo: '/mês',
    chamada: 'Assinar mensal',
    beneficios: [
      'Catálogo completo dos fornecedores',
      'Integração com o Mercado Livre',
      'Anúncios sem limite',
    ],
    checkout: checkoutBasico,
  },
  {
    id: 'premium',
    nome: 'Plano Premium',
    preco: 'R$ 229,00',
    precoAntigo: 'De R$ 497,00',
    periodo: 'Pagamento único',
    destaque: '💎 MELHOR VALOR',
    chamada: 'Pagar uma vez e pronto',
    beneficios: [
      'Tudo o que tem no Básico',
      'Pagamento único, sem mensalidade',
      'Acesso vitalício à plataforma',
      'Você nunca paga reajuste',
      'Se paga em menos de dois meses',
    ],
    checkout: checkoutPremium,
  },
];

/**
 * A mesma conta que `plano_em_dia()` faz no banco.
 *
 * Aqui ela serve para decidir tela; lá ela serve para decidir dado. O front
 * pode ser enganado por qualquer um com o console aberto, então esta função
 * nunca é a única defesa — é só o que evita mostrar uma tela inútil a quem não
 * pode usá-la.
 */
export function planoEmDia(perfil: PerfilDePlano | null | undefined): boolean {
  if (!perfil) {
    return false;
  }

  if (perfil.role === 'admin') {
    return true;
  }

  if (perfil.plan_status !== 'ativo') {
    return false;
  }

  if (!perfil.plan_expira_em) {
    return true;
  }

  return new Date(perfil.plan_expira_em).getTime() > Date.now();
}

/**
 * Explica em português por que o acesso está bloqueado. A pessoa que assinou e
 * esqueceu de renovar merece uma frase diferente de quem nunca pagou.
 */
export function motivoDoBloqueio(perfil: PerfilDePlano | null | undefined): string {
  const status = perfil?.plan_status;

  if (status === 'vencido') {
    return 'Sua assinatura venceu. Renove para voltar a usar o painel.';
  }

  if (status === 'cancelado') {
    return 'Sua assinatura foi cancelada. Escolha um plano para voltar.';
  }

  if (status === 'reembolsado') {
    return 'Sua compra foi reembolsada, então o acesso foi encerrado.';
  }

  return 'Escolha um plano para liberar seu acesso ao FORNEXA.';
}

/**
 * Monta o endereço do checkout já com quem está comprando.
 *
 * Levar o e-mail adiante importa mais do que parece: é por ele que o aviso de
 * pagamento reencontra a conta. Se o comprador digitar outro e-mail no
 * checkout, o pagamento chega órfão e alguém precisa ligar os dois na mão.
 */
export function montarCheckout(
  plano: Plano,
  dados?: { email?: string | null; nome?: string | null }
): string {
  if (!plano.checkout) {
    return '';
  }

  try {
    const url = new URL(plano.checkout);

    if (dados?.email) {
      url.searchParams.set('email', dados.email);
    }

    if (dados?.nome) {
      url.searchParams.set('name', dados.nome);
    }

    return url.toString();
  } catch {
    // Endereço mal formado no ambiente: melhor não gerar link do que gerar um
    // link quebrado que o comprador clica e não entende.
    return '';
  }
}
