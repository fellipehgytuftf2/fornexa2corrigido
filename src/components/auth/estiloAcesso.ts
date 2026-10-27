/**
 * Classes compartilhadas pelos formulários de login e cadastro, que ficam
 * dentro da folha clara da TelaDeAcesso.
 */

export const campoAcesso =
  'w-full h-[52px] px-[18px] bg-[#F4F6F7] border border-[#E1E6E9] rounded-[14px] ' +
  'text-[15px] text-[#06151E] placeholder:text-[#8A959C] transition-[border-color,box-shadow,background-color] ' +
  'focus:outline-none focus:bg-white focus:border-[#06151E] focus:shadow-[0_0_0_3px_rgba(6,21,30,0.12)] ' +
  'aria-[invalid=true]:border-red-400 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

export const rotuloAcesso = 'block text-sm font-semibold text-[#06151E] mb-2';

export const botaoAcesso =
  'acesso-botao w-full h-[54px] mt-1.5 inline-flex items-center justify-center gap-2 rounded-full ' +
  'bg-[#06151E] text-white text-base font-semibold hover:bg-navy-800 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#06151E]/40 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60';

export const linkTrocaAcesso =
  'inline-flex items-center min-h-[44px] px-1 font-semibold text-[#06151E] underline ' +
  'decoration-[#FFD300] decoration-2 underline-offset-4 hover:text-navy-800';

export const tituloAcesso =
  'font-display text-[28px] font-semibold tracking-[-0.02em] text-[#06151E]';

export const avisoErroAcesso =
  'acesso-aviso flex items-start gap-3 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3.5';
