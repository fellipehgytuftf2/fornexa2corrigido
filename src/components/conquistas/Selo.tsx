import {
  ArrowUpRight,
  Crown,
  Lock,
  Medal,
  Rocket,
  Star,
  Target,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * O selo de conquista.
 *
 * POR QUE DESENHADO AQUI, E NÃO UMA IMAGEM
 *
 * Selo em PNG precisa de uma arte por conquista, por tamanho e por tema — e o
 * FORNEXA tem claro e escuro. Desenhado, o mesmo componente serve os oito
 * selos, cresce sem borrar e troca de cor com o tema.
 *
 * POR QUE NÃO PARECE O SELO DE VERIFICADO
 *
 * O formato ondulado é o de medalha de prêmio, não o do check azul das redes:
 * borda em pétalas, anel interno e o ícone da conquista no centro, em azul
 * petróleo e dourado. Confundir os dois sugeriria selo de identidade, que é
 * outra promessa.
 */

const ICONES: Record<string, LucideIcon> = {
  raio: Zap,
  coroa: Crown,
  foguete: Rocket,
  grafico: TrendingUp,
  estrela: Star,
  medalha: Medal,
  seta: ArrowUpRight,
  alvo: Target,
};

const TAMANHOS = {
  p: { caixa: 32, icone: 12 },
  m: { caixa: 56, icone: 22 },
  g: { caixa: 96, icone: 38 },
} as const;

export type TamanhoDoSelo = keyof typeof TAMANHOS;

/**
 * O contorno em pétalas.
 *
 * Doze lobos num círculo: para cada um, um arco que sai um pouco além do raio.
 * Calculado uma vez, em coordenadas de 0 a 100, e esticado pelo SVG.
 */
function contornoOndulado(lobos = 12, raio = 40, altura = 7): string {
  const centro = 50;
  const passo = (Math.PI * 2) / lobos;
  const partes: string[] = [];

  for (let i = 0; i < lobos; i += 1) {
    const inicio = i * passo;
    const fim = inicio + passo;
    const meio = inicio + passo / 2;

    const x1 = centro + raio * Math.cos(inicio);
    const y1 = centro + raio * Math.sin(inicio);
    const x2 = centro + raio * Math.cos(fim);
    const y2 = centro + raio * Math.sin(fim);

    // O ponto de controle sai além do raio: é ele que faz a pétala.
    const cx = centro + (raio + altura) * Math.cos(meio) * 1.08;
    const cy = centro + (raio + altura) * Math.sin(meio) * 1.08;

    partes.push(i === 0 ? `M ${x1} ${y1}` : '');
    partes.push(`Q ${cx} ${cy} ${x2} ${y2}`);
  }

  partes.push('Z');
  return partes.filter(Boolean).join(' ');
}

const CONTORNO = contornoOndulado();

interface Props {
  icone?: string | null;
  tamanho?: TamanhoDoSelo;
  /** Sem a conquista: cinza, com cadeado. */
  bloqueado?: boolean;
  titulo?: string;
}

export default function Selo({ icone, tamanho = 'm', bloqueado = false, titulo }: Props) {
  const { caixa, icone: tamanhoDoIcone } = TAMANHOS[tamanho];
  const Icone = bloqueado ? Lock : ICONES[icone ?? 'estrela'] ?? Star;

  // Um id por instância evita que dois selos na mesma tela dividam o degradê.
  const id = `selo-${icone ?? 'estrela'}-${tamanho}-${bloqueado ? 'travado' : 'livre'}`;

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: caixa, height: caixa }}
      title={titulo}
      role="img"
      aria-label={titulo ?? (bloqueado ? 'Selo bloqueado' : 'Selo')}
    >
      <svg viewBox="0 0 100 100" width={caixa} height={caixa} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {bloqueado ? (
              <>
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.2" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#0f3d4c" />
                <stop offset="55%" stopColor="#12556a" />
                <stop offset="100%" stopColor="#f2b705" />
              </>
            )}
          </linearGradient>
        </defs>

        <path
          d={CONTORNO}
          fill={`url(#${id})`}
          className={bloqueado ? 'text-gray-400 dark:text-slate-600' : undefined}
        />

        {/* O anel interno separa a borda do ícone — sem ele, as pétalas e o
            desenho do centro se misturam nos tamanhos pequenos. */}
        <circle
          cx="50"
          cy="50"
          r="31"
          fill="none"
          stroke={bloqueado ? 'rgba(255,255,255,0.35)' : '#f7d774'}
          strokeWidth="2.5"
        />
      </svg>

      <Icone
        className={`absolute ${bloqueado ? 'text-white/80' : 'text-white'}`}
        style={{ width: tamanhoDoIcone, height: tamanhoDoIcone }}
        aria-hidden="true"
      />
    </span>
  );
}
