import { Link2, MessageCircle, User, Users } from 'lucide-react';
import type { Canal } from './useDivulgacao';

/** Peças pequenas do "Divulgar". */

export function IconeDoCanal({ canal, className }: { canal: Canal; className?: string }) {
  const Icone = { grupos: Users, perfil: User, whatsapp: MessageCircle, link: Link2 }[canal];
  return <Icone className={className} aria-hidden="true" />;
}

export function AvisoDeQuemPublica({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-gray-500 dark:text-slate-400 ${className}`}>
      Você publica em cada lugar. A FORNEXA deixa o texto pronto e abre o caminho — o
      Facebook não aceita publicação automática.
    </p>
  );
}
