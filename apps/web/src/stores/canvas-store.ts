import type { LayoutBlock } from '@orbit/shared-types';
import * as Y from 'yjs';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  bindWorkspaceUndoManager,
  observeBlocks,
  readAllBlocks,
} from '@/lib/yjs/workspace-doc';

interface CanvasState {
  doc: Y.Doc | null;
  undoManager: Y.UndoManager | null;
  blockIds: string[];
  blocks: Record<string, LayoutBlock>;
  selectedBlockId: string | null;
  draggingBlockId: string | null;
  ready: boolean;
  bindDoc: (doc: Y.Doc) => () => void;
  setSelectedBlockId: (id: string | null) => void;
  setDraggingBlockId: (id: string | null) => void;
  syncFromDoc: () => void;
}

function blocksEqual(a: LayoutBlock, b: LayoutBlock): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    a.content === b.content &&
    a.stackOrder === b.stackOrder &&
    a.updatedAt === b.updatedAt
  );
}

function buildBlocksState(doc: Y.Doc, previous: Record<string, LayoutBlock> = {}) {
  const blocks = readAllBlocks(doc);
  const nextBlocks: Record<string, LayoutBlock> = {};

  for (const block of blocks) {
    const prev = previous[block.id];
    nextBlocks[block.id] = prev && blocksEqual(prev, block) ? prev : block;
  }

  return {
    doc,
    blockIds: blocks.map((b) => b.id),
    blocks: nextBlocks,
    ready: true,
  };
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  doc: null,
  undoManager: null,
  blockIds: [],
  blocks: {},
  selectedBlockId: null,
  draggingBlockId: null,
  ready: false,

  bindDoc: (doc: Y.Doc) => {
    let rafId: number | null = null;
    const undoManager = bindWorkspaceUndoManager(doc);

    const syncFromDoc = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const previous = get().blocks;
        set(buildBlocksState(doc, previous));
      });
    };

    const unobserve = observeBlocks(doc, syncFromDoc);
    set({ ...buildBlocksState(doc), undoManager });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unobserve();
      undoManager.destroy();
      set({ undoManager: null });
    };
  },

  setSelectedBlockId: (id) => set({ selectedBlockId: id }),

  setDraggingBlockId: (id) => set({ draggingBlockId: id }),

  syncFromDoc: () => {
    const { doc, blocks } = get();
    if (!doc) return;
    set(buildBlocksState(doc, blocks));
  },
}));

export function useBlockIds(): string[] {
  return useCanvasStore(useShallow((s) => s.blockIds));
}

export function useBlock(id: string): LayoutBlock | undefined {
  return useCanvasStore((s) => s.blocks[id]);
}

export function useBlockPosition(id: string): Pick<LayoutBlock, 'x' | 'y' | 'w' | 'h'> | undefined {
  return useCanvasStore(
    useShallow((s) => {
      const block = s.blocks[id];
      if (!block) return undefined;
      return { x: block.x, y: block.y, w: block.w, h: block.h };
    }),
  );
}

export function useSelectedBlockId(): string | null {
  return useCanvasStore((s) => s.selectedBlockId);
}

export function useDraggingBlockId(): string | null {
  return useCanvasStore((s) => s.draggingBlockId);
}

export function useCanvasReady(): boolean {
  return useCanvasStore((s) => s.ready);
}

export function useCanvasDoc(): Y.Doc | null {
  return useCanvasStore((s) => s.doc);
}
