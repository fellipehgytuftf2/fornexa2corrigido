import React, { CSSProperties, ReactNode, HTMLAttributes } from 'react';

// ============================================================================
// FORNEXA — AnimatedGradientBorder
// ============================================================================
// Base técnica adaptada de um componente de borda com gradiente cônico
// rotativo. A identidade visual foi inteiramente reconstruída para seguir o
// design system da FORNEXA (navy + dourado), em vez das cores originais do
// componente de referência.
//
// Uso típico: envolver o mockup do dashboard na Hero para dar um contorno
// dourado sutil e sofisticado, reforçando a sensação "premium" sem cair em
// um efeito chamativo/neon.
// ============================================================================

type AnimationMode = 'auto-rotate' | 'rotate-on-hover' | 'stop-rotate-on-hover';

interface AnimatedGradientBorderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className'> {
  children: ReactNode;
  className?: string;

  animationMode?: AnimationMode;
  animationSpeed?: number; // duração em segundos

  gradientColors?: {
    primary: string;
    secondary: string;
    accent: string;
  };
  backgroundColor?: string;

  borderWidth?: number;
  borderRadius?: number;

  style?: CSSProperties;
}

// Paleta padrão FORNEXA: tons de dourado institucional sobre fundo navy,
// em vez das cores do componente original (vermelho/roxo de exemplo).
const fornexaGradientColors = {
  primary: '#8A6D1F', // dourado escuro (base do gradiente)
  secondary: '#FFD300', // dourado institucional (gold DEFAULT)
  accent: '#FFF3B0', // dourado claro (brilho/realce)
};

const fornexaBackgroundColor = '#06151E'; // navy-900 do design system

const AnimatedGradientBorder: React.FC<AnimatedGradientBorderProps> = ({
  children,
  className = '',
  animationMode = 'rotate-on-hover',
  animationSpeed = 8,
  gradientColors = fornexaGradientColors,
  backgroundColor = fornexaBackgroundColor,
  borderWidth = 2,
  borderRadius = 16, // igual ao "rounded-2xl" (16px) já usado no design system
  style = {},
  ...props
}) => {
  const getAnimationClass = () => {
    switch (animationMode) {
      case 'auto-rotate':
        return 'fornexa-gradient-border-auto';
      case 'rotate-on-hover':
        return 'fornexa-gradient-border-hover';
      case 'stop-rotate-on-hover':
        return 'fornexa-gradient-border-stop-hover';
      default:
        return '';
    }
  };

  const combinedStyle: CSSProperties = {
    '--gradient-primary': gradientColors.primary,
    '--gradient-secondary': gradientColors.secondary,
    '--gradient-accent': gradientColors.accent,
    '--bg-color': backgroundColor,
    '--border-width': `${borderWidth}px`,
    '--border-radius': `${borderRadius}px`,
    '--animation-duration': `${animationSpeed}s`,
    border: `${borderWidth}px solid transparent`,
    borderRadius: `${borderRadius}px`,
    backgroundImage: `
      linear-gradient(${backgroundColor}, ${backgroundColor}),
      conic-gradient(
        from var(--gradient-angle, 0deg),
        ${gradientColors.primary} 0%,
        ${gradientColors.secondary} 30%,
        ${gradientColors.accent} 45%,
        ${gradientColors.secondary} 60%,
        ${gradientColors.primary} 75%,
        ${gradientColors.primary} 100%
      )
    `,
    backgroundClip: 'padding-box, border-box',
    backgroundOrigin: 'padding-box, border-box',
    ...style,
  } as CSSProperties;

  return (
    <div
      className={`fornexa-gradient-border ${getAnimationClass()} ${className}`}
      style={combinedStyle}
      {...props}
    >
      {children}
    </div>
  );
};

export { AnimatedGradientBorder };