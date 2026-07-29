/**
 * Conteúdo estático dos tutoriais.
 *
 * Este arquivo já teve produtos, pedidos, fornecedores, chamados e usuários de
 * exemplo. Todos foram removidos: as telas passaram a ler do Supabase, e dado
 * falso parado ao lado de código que fala com banco real é convite a engano.
 * Era também a origem de treze erros de tipo, porque os objetos aqui foram
 * ficando para trás em relação a `src/types`.
 *
 * O que sobrou não é simulação, é conteúdo editorial: a lista exibida em
 * Tutoriais. Quando ela virar tabela no banco, este arquivo deixa de existir.
 */

export interface Tutorial {
  id: string;
  title: string;
  type: 'video' | 'pdf' | 'faq';
  duration?: string;
}

export const tutorials: Tutorial[] = [
  {
    id: '1',
    title: 'Primeiros passos no Fornexa',
    type: 'video',
    duration: '5:30',
  },
  {
    id: '2',
    title: 'Como conectar o Mercado Livre',
    type: 'video',
    duration: '3:45',
  },
  {
    id: '3',
    title: 'Calculando margens de lucro',
    type: 'pdf',
  },
  {
    id: '4',
    title: 'FAQ - Perguntas frequentes',
    type: 'faq',
  },
];
