/**
 * Até quando o pedido ainda sai hoje.
 *
 * O fornecedor tem uma hora limite: passou dela, o pedido só é despachado no
 * próximo dia útil. Antes isso vivia no WhatsApp, e todo vendedor novo
 * descobria errando — mandava às 14h achando que sairia no mesmo dia, e o
 * comprador recebia um dia depois do prometido no anúncio.
 */

/**
 * A hora agora no fuso do Brasil, em minutos desde a meia-noite.
 *
 * O relógio do computador do vendedor pode estar em qualquer fuso, e o corte é
 * do fornecedor — que está no Brasil. Comparar com a hora local levaria o
 * vendedor a achar que ainda dá tempo quando já passou.
 */
function agoraEmSaoPaulo(): { minutos: number; diaDaSemana: number } {
  const formatador = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const partes = formatador.formatToParts(new Date());
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? 0);
  const minuto = Number(partes.find((p) => p.type === 'minute')?.value ?? 0);

  // `weekday` vem como texto e varia com o navegador; o dia da semana sai de um
  // caminho próprio, mais previsível.
  const emSaoPaulo = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );

  return { minutos: hora * 60 + minuto, diaDaSemana: emSaoPaulo.getDay() };
}

/** "13:00:00" vira 780. Devolve nulo quando o fornecedor não definiu corte. */
function emMinutos(horario: string | null): number | null {
  if (!horario) {
    return null;
  }

  const [hora, minuto] = horario.split(':').map(Number);

  if (!Number.isFinite(hora) || !Number.isFinite(minuto)) {
    return null;
  }

  return hora * 60 + minuto;
}

/** "13:00:00" vira "13:00". */
export function horaCurta(horario: string | null): string {
  return horario ? horario.slice(0, 5) : '';
}

export interface SituacaoDoCorte {
  /** Ainda dá para sair hoje. */
  saiHoje: boolean;
  /** Frase pronta para a tela. */
  texto: string;
}

/**
 * Compara a hora de agora com o corte e diz, em uma frase, o que acontece.
 *
 * Fim de semana é tratado como "não sai hoje" sem olhar a hora: não adianta o
 * corte ser 13h se ninguém está no galpão. Feriado fica de fora de propósito —
 * manter tabela de feriado é trabalho recorrente que ninguém lembra de fazer, e
 * um aviso mais pessimista erra para o lado seguro.
 */
export function situacaoDoCorte(
  horarioCorte: string | null,
  rotulo = 'etiqueta normal'
): SituacaoDoCorte | null {
  const corte = emMinutos(horarioCorte);

  if (corte === null) {
    return null;
  }

  const { minutos, diaDaSemana } = agoraEmSaoPaulo();
  const hora = horaCurta(horarioCorte);

  if (diaDaSemana === 0 || diaDaSemana === 6) {
    return {
      saiHoje: false,
      texto: `Corte ${hora} (${rotulo}) — fim de semana, sai na segunda.`,
    };
  }

  if (minutos >= corte) {
    const amanhaEhSexta = diaDaSemana === 5;

    return {
      saiHoje: false,
      texto: `Passou do corte das ${hora} (${rotulo}) — sai ${
        amanhaEhSexta ? 'na segunda' : 'amanhã'
      }.`,
    };
  }

  const faltam = corte - minutos;
  const horas = Math.floor(faltam / 60);
  const restoDeMinutos = faltam % 60;

  const quanto =
    horas > 0 ? `${horas}h${String(restoDeMinutos).padStart(2, '0')}` : `${faltam} min`;

  return {
    saiHoje: true,
    texto: `Corte ${hora} (${rotulo}) — faltam ${quanto} para sair hoje.`,
  };
}
