import {
  useEffect,
  useMemo,
  useState,
  type ClipboardEvent,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle, GripVertical, ImagePlus, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ModalPortal from '../../components/ui/modal-portal';

type Coluna = 'a_fazer' | 'em_andamento' | 'feito';
type Prioridade = 'urgente' | 'normal';

interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  coluna: Coluna;
  posicao: number;
  prioridade: Prioridade;
  /** Caminhos no balde `kanban`. Print da tela que originou a tarefa. */
  imagens: string[];
}

const COLUNAS_DA_TAREFA = 'id, titulo, descricao, coluna, posicao, prioridade, imagens';

const COLUNAS: { id: Coluna; titulo: string; corPonto: string }[] = [
  { id: 'a_fazer', titulo: 'A fazer', corPonto: 'bg-gray-400' },
  { id: 'em_andamento', titulo: 'Em andamento', corPonto: 'bg-amber-400' },
  { id: 'feito', titulo: 'Feito', corPonto: 'bg-green-500' },
];

type Board = Record<Coluna, Tarefa[]>;

const boardVazio: Board = { a_fazer: [], em_andamento: [], feito: [] };

function agruparPorColuna(tarefas: Tarefa[]): Board {
  const board: Board = { a_fazer: [], em_andamento: [], feito: [] };
  for (const tarefa of tarefas) {
    board[tarefa.coluna].push(tarefa);
  }
  for (const coluna of COLUNAS) {
    board[coluna.id].sort((a, b) => a.posicao - b.posicao);
  }
  return board;
}

/** Em qual coluna e em que índice um card está agora. */
function localizar(board: Board, id: string): { coluna: Coluna; indice: number } | null {
  for (const coluna of COLUNAS) {
    const indice = board[coluna.id].findIndex((t) => t.id === id);
    if (indice !== -1) return { coluna: coluna.id, indice };
  }
  return null;
}

/**
 * Os prints de um card.
 *
 * Miniatura que abre a imagem inteira em outra aba: o print de tela chega em
 * 1900px de largura e não se lê dentro de um modal de 448px.
 */
function Anexos({
  caminhos,
  urls,
  subindo,
  onEscolher,
  onRemover,
}: {
  caminhos: string[];
  urls: Record<string, string>;
  subindo: boolean;
  onEscolher: (arquivo: File) => void;
  onRemover: (caminho: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
        Imagens
      </label>

      {caminhos.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {caminhos.map((caminho) => (
            <div key={caminho} className="relative">
              <a href={urls[caminho]} target="_blank" rel="noreferrer">
                <img
                  src={urls[caminho]}
                  alt="Print anexado"
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-navy-600 bg-gray-50 dark:bg-navy-700"
                />
              </a>

              <button
                type="button"
                onClick={() => onRemover(caminho)}
                aria-label="Remover imagem"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-800"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-navy-600 text-sm font-medium text-gray-600 dark:text-slate-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
        <ImagePlus className="w-4 h-4" aria-hidden="true" />
        {subindo ? 'Enviando...' : 'Anexar print'}

        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={subindo}
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            if (arquivo) onEscolher(arquivo);
            evento.target.value = '';
          }}
        />
      </label>

      <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
        Ou dê Ctrl+V com o print copiado, em qualquer lugar desta janela.
      </p>
    </div>
  );
}

function Cartao({
  tarefa,
  onClick,
  onTogglePrioridade,
}: {
  tarefa: Tarefa;
  onClick: () => void;
  onTogglePrioridade: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarefa.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm p-3 flex items-start gap-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-0.5 text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing touch-none shrink-0"
        aria-label="Arrastar"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium text-navy-900 dark:text-white break-words">
          {tarefa.titulo}
        </p>

        {tarefa.descricao && (
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 line-clamp-2 break-words">
            {tarefa.descricao}
          </p>
        )}

        {tarefa.imagens?.length > 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 mt-1.5">
            <Paperclip className="w-3 h-3" aria-hidden="true" />
            {tarefa.imagens.length}
          </p>
        )}
      </button>

      {/* Clique direto no card muda a prioridade sem precisar abrir o
          modal de editar — é o que se olha toda hora, tem que ser rápido. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onTogglePrioridade();
        }}
        title={tarefa.prioridade === 'urgente' ? 'Urgente — clique pra marcar normal' : 'Normal — clique pra marcar urgente'}
        className={`mt-1 w-3 h-3 rounded-full shrink-0 transition-colors ${
          tarefa.prioridade === 'urgente'
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-green-500 hover:bg-green-600'
        }`}
      />
    </div>
  );
}

/**
 * Área de soltar da coluna inteira, além dos cards.
 *
 * Sem isto, uma coluna vazia (sem card nenhum) não tinha em cima do que
 * soltar — SortableContext só reconhece os itens que já tem dentro. É por
 * isso que arrastar para "Em andamento"/"Feito" vazias não funcionava.
 */
function ColunaSoltavel({ id, children }: { id: Coluna; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="space-y-2 min-h-[60px]">
      {children}
    </div>
  );
}

function SeletorDePrioridade({
  valor,
  onChange,
}: {
  valor: Prioridade;
  onChange: (prioridade: Prioridade) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
        Prioridade
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange('urgente')}
          className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
            valor === 'urgente'
              ? 'bg-red-500 border-red-500 text-white'
              : 'border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          Urgente
        </button>

        <button
          type="button"
          onClick={() => onChange('normal')}
          className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
            valor === 'normal'
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          Não urgente
        </button>
      </div>
    </div>
  );
}

export default function AdminKanban() {
  const [board, setBoard] = useState<Board>(boardVazio);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const [novaTarefaAberta, setNovaTarefaAberta] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [novaPrioridade, setNovaPrioridade] = useState<Prioridade>('normal');
  const [salvando, setSalvando] = useState(false);

  const [tarefaEditando, setTarefaEditando] = useState<Tarefa | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  /**
   * Imagens.
   *
   * O balde é privado — print do FORNEXA carrega endereço de cliente e valor
   * de pedido —, então nada aqui é URL direta: cada caminho vira uma URL
   * assinada de uma hora, guardada enquanto a tela está aberta.
   */
  const [urlsDeImagem, setUrlsDeImagem] = useState<Record<string, string>>({});
  const [subindoImagem, setSubindoImagem] = useState(false);
  /** Imagens já enviadas para um card que ainda não foi criado. */
  const [novasImagens, setNovasImagens] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Assina só o que está na tela e ainda não tem URL. Assinar o quadro
  // inteiro gastaria uma chamada por print de card que ninguém abriu.
  useEffect(() => {
    const caminhos = [...(tarefaEditando?.imagens ?? []), ...novasImagens].filter(
      (caminho) => !urlsDeImagem[caminho]
    );

    if (caminhos.length === 0) return;

    let vivo = true;

    (async () => {
      const novas: Record<string, string> = {};

      for (const caminho of caminhos) {
        const { data } = await supabase.storage
          .from('kanban')
          .createSignedUrl(caminho, 3600);

        if (data?.signedUrl) novas[caminho] = data.signedUrl;
      }

      if (vivo && Object.keys(novas).length > 0) {
        setUrlsDeImagem((atuais) => ({ ...atuais, ...novas }));
      }
    })();

    return () => {
      vivo = false;
    };
  }, [tarefaEditando, novasImagens, urlsDeImagem]);

  const subirImagem = async (arquivo: File): Promise<string | null> => {
    setSubindoImagem(true);
    setErrorMessage('');

    const extensao = arquivo.name.split('.').pop()?.toLowerCase() || 'png';
    const caminho = `${crypto.randomUUID()}.${extensao}`;

    const { error } = await supabase.storage.from('kanban').upload(caminho, arquivo, {
      contentType: arquivo.type || 'image/png',
    });

    setSubindoImagem(false);

    if (error) {
      setErrorMessage(`Não foi possível enviar a imagem: ${error.message}`);
      return null;
    }

    return caminho;
  };

  /** Troca um card pelo mesmo card atualizado, onde quer que ele esteja. */
  const trocarNoBoard = (tarefa: Tarefa) => {
    setBoard((atual) => {
      const posicao = localizar(atual, tarefa.id);
      if (!posicao) return atual;
      const coluna = [...atual[posicao.coluna]];
      coluna[posicao.indice] = tarefa;
      return { ...atual, [posicao.coluna]: coluna };
    });
  };

  /**
   * No card já criado a imagem grava na hora, sem esperar o botão Salvar:
   * quem anexa um print e fecha o modal espera que ele tenha ficado lá.
   */
  const anexarNaTarefa = async (arquivo: File) => {
    if (!tarefaEditando) return;

    const caminho = await subirImagem(arquivo);
    if (!caminho) return;

    const imagens = [...(tarefaEditando.imagens ?? []), caminho];

    const { error } = await supabase
      .from('admin_tarefas')
      .update({ imagens, atualizado_em: new Date().toISOString() })
      .eq('id', tarefaEditando.id);

    if (error) {
      setErrorMessage(`Não foi possível salvar a imagem: ${error.message}`);
      return;
    }

    const atualizada = { ...tarefaEditando, imagens };
    setTarefaEditando(atualizada);
    trocarNoBoard(atualizada);
  };

  const removerImagemDaTarefa = async (caminho: string) => {
    if (!tarefaEditando) return;

    const imagens = (tarefaEditando.imagens ?? []).filter((atual) => atual !== caminho);

    const { error } = await supabase
      .from('admin_tarefas')
      .update({ imagens, atualizado_em: new Date().toISOString() })
      .eq('id', tarefaEditando.id);

    if (error) {
      setErrorMessage(`Não foi possível remover a imagem: ${error.message}`);
      return;
    }

    await supabase.storage.from('kanban').remove([caminho]);

    const atualizada = { ...tarefaEditando, imagens };
    setTarefaEditando(atualizada);
    trocarNoBoard(atualizada);
  };

  const anexarNoCardNovo = async (arquivo: File) => {
    const caminho = await subirImagem(arquivo);
    if (caminho) setNovasImagens((atuais) => [...atuais, caminho]);
  };

  const removerImagemNova = async (caminho: string) => {
    setNovasImagens((atuais) => atuais.filter((outro) => outro !== caminho));
    await supabase.storage.from('kanban').remove([caminho]);
  };

  /** Ctrl+V com print na área de transferência anexa direto. */
  const colar =
    (anexar: (arquivo: File) => void) => (evento: ClipboardEvent<HTMLDivElement>) => {
      const arquivo = Array.from(evento.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith('image/')
      );

      if (!arquivo) return;

      evento.preventDefault();
      anexar(arquivo);
    };

  const carregar = async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('admin_tarefas')
      .select(COLUNAS_DA_TAREFA)
      .order('posicao', { ascending: true });

    setLoading(false);

    if (error) {
      setErrorMessage(`Não foi possível carregar o quadro: ${error.message}`);
      return;
    }

    setBoard(agruparPorColuna((data || []) as Tarefa[]));
  };

  useEffect(() => {
    carregar();
  }, []);

  const alternarPrioridade = async (tarefa: Tarefa) => {
    const novaPrioridade: Prioridade = tarefa.prioridade === 'urgente' ? 'normal' : 'urgente';

    setBoard((atual) => {
      const posicao = localizar(atual, tarefa.id);
      if (!posicao) return atual;
      const coluna = [...atual[posicao.coluna]];
      coluna[posicao.indice] = { ...coluna[posicao.indice], prioridade: novaPrioridade };
      return { ...atual, [posicao.coluna]: coluna };
    });

    const { error } = await supabase
      .from('admin_tarefas')
      .update({ prioridade: novaPrioridade, atualizado_em: new Date().toISOString() })
      .eq('id', tarefa.id);

    if (error) {
      setErrorMessage(`Não foi possível mudar a prioridade: ${error.message}`);
    }
  };

  const activeTarefa = useMemo(() => {
    if (!activeId) return null;
    for (const coluna of COLUNAS) {
      const achada = board[coluna.id].find((t) => t.id === activeId);
      if (achada) return achada;
    }
    return null;
  }, [activeId, board]);

  /** Grava no banco a ordem/coluna atual de todo card de uma coluna. */
  const persistirColuna = async (coluna: Coluna, tarefas: Tarefa[]) => {
    await Promise.all(
      tarefas.map((tarefa, indice) =>
        supabase
          .from('admin_tarefas')
          .update({ coluna, posicao: indice, atualizado_em: new Date().toISOString() })
          .eq('id', tarefa.id)
      )
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  // Durante o arraste, sempre que o card passa por cima de outra coluna (ou
  // de outro card de outra coluna), já move ele visualmente — sem esperar
  // soltar. É o padrão do dnd-kit pra arrastar entre colunas diferentes.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const ativoId = String(active.id);
    const sobreId = String(over.id);
    if (ativoId === sobreId) return;

    const origem = localizar(board, ativoId);
    if (!origem) return;

    const colunaDestino = (COLUNAS.some((c) => c.id === sobreId)
      ? (sobreId as Coluna)
      : localizar(board, sobreId)?.coluna) as Coluna | undefined;

    if (!colunaDestino || colunaDestino === origem.coluna) return;

    setBoard((atual) => {
      const tarefa = atual[origem.coluna][origem.indice];
      const novaOrigem = atual[origem.coluna].filter((t) => t.id !== ativoId);

      const destinoAtual = atual[colunaDestino];
      const indiceDestino = destinoAtual.findIndex((t) => t.id === sobreId);
      const novoDestino = [...destinoAtual];
      novoDestino.splice(indiceDestino === -1 ? novoDestino.length : indiceDestino, 0, {
        ...tarefa,
        coluna: colunaDestino,
      });

      return { ...atual, [origem.coluna]: novaOrigem, [colunaDestino]: novoDestino };
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const ativoId = String(active.id);
    const sobreId = String(over.id);

    const posicaoAtual = localizar(board, ativoId);
    if (!posicaoAtual) return;

    const colunaFinal = posicaoAtual.coluna;
    let colunaReordenada = board[colunaFinal];

    // Ainda na mesma coluna e em cima de outro card: reordena dentro dela.
    if (ativoId !== sobreId && board[colunaFinal].some((t) => t.id === sobreId)) {
      const de = board[colunaFinal].findIndex((t) => t.id === ativoId);
      const para = board[colunaFinal].findIndex((t) => t.id === sobreId);
      colunaReordenada = arrayMove(board[colunaFinal], de, para);
      setBoard((atual) => ({ ...atual, [colunaFinal]: colunaReordenada }));
    }

    await persistirColuna(colunaFinal, colunaReordenada);

    // A coluna de origem, se o card mudou de coluna durante o arraste
    // (handleDragOver já tirou ele de lá), também precisa das posições
    // recalculadas sem o buraco que ele deixou.
    for (const coluna of COLUNAS) {
      if (coluna.id !== colunaFinal) {
        await persistirColuna(coluna.id, board[coluna.id]);
      }
    }
  };

  const criarTarefa = async () => {
    if (!novoTitulo.trim()) return;

    setSalvando(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const posicao = board.a_fazer.length;

    const { data, error } = await supabase
      .from('admin_tarefas')
      .insert({
        titulo: novoTitulo.trim(),
        descricao: novaDescricao.trim() || null,
        coluna: 'a_fazer',
        posicao,
        prioridade: novaPrioridade,
        imagens: novasImagens,
        criado_por: user?.id ?? null,
      })
      .select(COLUNAS_DA_TAREFA)
      .single();

    setSalvando(false);

    if (error) {
      setErrorMessage(`Não foi possível criar a tarefa: ${error.message}`);
      return;
    }

    setBoard((atual) => ({ ...atual, a_fazer: [...atual.a_fazer, data as Tarefa] }));
    setNovoTitulo('');
    setNovaDescricao('');
    setNovaPrioridade('normal');
    setNovasImagens([]);
    setNovaTarefaAberta(false);
  };

  const salvarEdicao = async () => {
    if (!tarefaEditando || !tarefaEditando.titulo.trim()) return;

    setSalvando(true);

    const { error } = await supabase
      .from('admin_tarefas')
      .update({
        titulo: tarefaEditando.titulo.trim(),
        descricao: tarefaEditando.descricao?.trim() || null,
        prioridade: tarefaEditando.prioridade,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', tarefaEditando.id);

    setSalvando(false);

    if (error) {
      setErrorMessage(`Não foi possível salvar: ${error.message}`);
      return;
    }

    setBoard((atual) => {
      const posicao = localizar(atual, tarefaEditando.id);
      if (!posicao) return atual;
      const coluna = [...atual[posicao.coluna]];
      coluna[posicao.indice] = tarefaEditando;
      return { ...atual, [posicao.coluna]: coluna };
    });

    setTarefaEditando(null);
  };

  const excluirTarefa = async () => {
    if (!tarefaEditando) return;

    setExcluindo(true);

    const { error } = await supabase.from('admin_tarefas').delete().eq('id', tarefaEditando.id);

    setExcluindo(false);

    if (error) {
      setErrorMessage(`Não foi possível excluir: ${error.message}`);
      return;
    }

    setBoard((atual) => {
      const posicao = localizar(atual, tarefaEditando.id);
      if (!posicao) return atual;
      return {
        ...atual,
        [posicao.coluna]: atual[posicao.coluna].filter((t) => t.id !== tarefaEditando.id),
      };
    });

    setTarefaEditando(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Kanban</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            O que o time precisa fazer, arrastando entre "A fazer", "Em andamento" e "Feito".
          </p>
        </div>

        <button
          onClick={() => setNovaTarefaAberta(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova tarefa
        </button>
      </div>

      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
          <p className="text-red-700 dark:text-red-400 text-sm font-medium">{errorMessage}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">Carregando quadro...</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {COLUNAS.map((coluna) => (
              <div
                key={coluna.id}
                className="bg-gray-50 dark:bg-navy-900 rounded-2xl border border-gray-200 dark:border-navy-700 p-3"
              >
                <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                  <span className={`w-2 h-2 rounded-full ${coluna.corPonto}`} />
                  <h2 className="text-sm font-semibold text-navy-900 dark:text-white">
                    {coluna.titulo}
                  </h2>
                  <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">
                    {board[coluna.id].length}
                  </span>
                </div>

                <SortableContext
                  id={coluna.id}
                  items={board[coluna.id].map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ColunaSoltavel id={coluna.id}>
                    {board[coluna.id].map((tarefa) => (
                      <Cartao
                        key={tarefa.id}
                        tarefa={tarefa}
                        onClick={() => setTarefaEditando(tarefa)}
                        onTogglePrioridade={() => alternarPrioridade(tarefa)}
                      />
                    ))}
                  </ColunaSoltavel>
                </SortableContext>
              </div>
            ))}
          </div>

          <DragOverlay>
            {activeTarefa && (
              <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-lg p-3 rotate-2">
                <p className="text-sm font-medium text-navy-900 dark:text-white">
                  {activeTarefa.titulo}
                </p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {novaTarefaAberta && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
              onPaste={colar(anexarNoCardNovo)}
              className="bg-white dark:bg-navy-800 rounded-2xl w-full max-w-md shadow-2xl"
            >
              <div className="p-5 border-b border-gray-200 dark:border-navy-700 flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold text-navy-900 dark:text-white">
                  Nova tarefa
                </h3>

                <button
                  onClick={() => setNovaTarefaAberta(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white shrink-0"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                    Título
                  </label>
                  <input
                    type="text"
                    value={novoTitulo}
                    onChange={(event) => setNovoTitulo(event.target.value)}
                    placeholder="Ex: Corrigir renovação de token do ML"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                    Descrição (opcional)
                  </label>
                  <textarea
                    value={novaDescricao}
                    onChange={(event) => setNovaDescricao(event.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-none"
                  />
                </div>

                <SeletorDePrioridade valor={novaPrioridade} onChange={setNovaPrioridade} />

                <Anexos
                  caminhos={novasImagens}
                  urls={urlsDeImagem}
                  subindo={subindoImagem}
                  onEscolher={anexarNoCardNovo}
                  onRemover={removerImagemNova}
                />
              </div>

              <div className="p-5 border-t border-gray-200 dark:border-navy-700 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setNovasImagens([]);
                    setNovaTarefaAberta(false);
                  }}
                  className="px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
                >
                  Cancelar
                </button>

                <button
                  onClick={criarTarefa}
                  disabled={salvando || !novoTitulo.trim()}
                  className="px-5 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {salvando ? 'Criando...' : 'Criar tarefa'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {tarefaEditando && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
              onPaste={colar(anexarNaTarefa)}
              className="bg-white dark:bg-navy-800 rounded-2xl w-full max-w-md shadow-2xl"
            >
              <div className="p-5 border-b border-gray-200 dark:border-navy-700 flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold text-navy-900 dark:text-white">
                  Editar tarefa
                </h3>

                <button
                  onClick={() => setTarefaEditando(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white shrink-0"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                    Título
                  </label>
                  <input
                    type="text"
                    value={tarefaEditando.titulo}
                    onChange={(event) =>
                      setTarefaEditando({ ...tarefaEditando, titulo: event.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                    Descrição
                  </label>
                  <textarea
                    value={tarefaEditando.descricao ?? ''}
                    onChange={(event) =>
                      setTarefaEditando({ ...tarefaEditando, descricao: event.target.value })
                    }
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-none"
                  />
                </div>

                <SeletorDePrioridade
                  valor={tarefaEditando.prioridade}
                  onChange={(prioridade) =>
                    setTarefaEditando({ ...tarefaEditando, prioridade })
                  }
                />

                <Anexos
                  caminhos={tarefaEditando.imagens ?? []}
                  urls={urlsDeImagem}
                  subindo={subindoImagem}
                  onEscolher={anexarNaTarefa}
                  onRemover={removerImagemDaTarefa}
                />
              </div>

              <div className="p-5 border-t border-gray-200 dark:border-navy-700 flex justify-between gap-3">
                <button
                  onClick={excluirTarefa}
                  disabled={excluindo}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {excluindo ? 'Excluindo...' : 'Excluir'}
                </button>

                <button
                  onClick={salvarEdicao}
                  disabled={salvando || !tarefaEditando.titulo.trim()}
                  className="px-5 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
