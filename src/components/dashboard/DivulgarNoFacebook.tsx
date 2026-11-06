import DivulgarEstudio from './divulgar/DivulgarEstudio';
import type { DadosDaDivulgacao } from './divulgar/useDivulgacao';

/**
 * O "Divulgar" de Meus Anúncios: janela com a prévia do post no grupo, a
 * mensagem com "Gerar com IA" e um botão por lugar (grupos, post, WhatsApp,
 * link). O desenho está em divulgar/DivulgarEstudio; o comportamento, em
 * divulgar/useDivulgacao.
 */
export default function DivulgarNoFacebook(props: DadosDaDivulgacao & { aoFechar: () => void }) {
  return <DivulgarEstudio {...props} />;
}
