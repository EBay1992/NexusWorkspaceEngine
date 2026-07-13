'use client';

import { GRID_CELL_PX } from '@orbit/shared-types';
import { useCallback, useMemo } from 'react';
import { useThrottledCallback } from '@/hooks/use-throttled-callback';
import { shortcutModLabel, useCanvasShortcuts } from '@/hooks/use-canvas-shortcuts';
import {
  addBlock,
  bringBlockToFront,
  createDefaultBlock,
  deleteBlock,
  duplicateBlock,
  updateBlock,
} from '@/lib/yjs/workspace-doc';
import {
  useBlock,
  useBlockIds,
  useCanvasDoc,
  useCanvasReady,
  useCanvasStore,
  useSelectedBlockId,
} from '@/stores/canvas-store';
import { BlockRenderer } from './BlockRenderer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WorkspaceCanvasProps {
  readOnly?: boolean;
}

export function WorkspaceCanvas({ readOnly = false }: WorkspaceCanvasProps) {
  const doc = useCanvasDoc();
  const ready = useCanvasReady();
  const blockIds = useBlockIds();
  const selectedBlockId = useSelectedBlockId();
  const setSelectedBlockId = useCanvasStore((s) => s.setSelectedBlockId);

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        setSelectedBlockId(null);
      }
    },
    [setSelectedBlockId],
  );

  const handleAddBlock = useCallback(() => {
    if (readOnly || !doc) return;
    const block = createDefaultBlock({
      x: 6,
      y: 6,
      content: 'New note',
    });
    addBlock(doc, block);
    bringBlockToFront(doc, block.id);
    setSelectedBlockId(block.id);
  }, [doc, readOnly, setSelectedBlockId]);

  const handleDeleteSelected = useCallback(() => {
    if (readOnly || !doc || !selectedBlockId) return;
    deleteBlock(doc, selectedBlockId);
    setSelectedBlockId(null);
  }, [doc, readOnly, selectedBlockId, setSelectedBlockId]);

  const handleDuplicateSelected = useCallback(() => {
    if (readOnly || !doc || !selectedBlockId) return;
    const copy = duplicateBlock(doc, selectedBlockId);
    if (copy) setSelectedBlockId(copy.id);
  }, [doc, readOnly, selectedBlockId, setSelectedBlockId]);

  const handleDeselect = useCallback(() => {
    setSelectedBlockId(null);
  }, [setSelectedBlockId]);

  const shortcutActions = useMemo(
    () => ({
      onAddBlock: handleAddBlock,
      onDeleteSelected: handleDeleteSelected,
      onDuplicateSelected: handleDuplicateSelected,
      onDeselect: handleDeselect,
    }),
    [handleAddBlock, handleDeleteSelected, handleDuplicateSelected, handleDeselect],
  );

  useCanvasShortcuts(readOnly, shortcutActions);

  const mod = shortcutModLabel();

  if (!ready || !doc) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        {!readOnly && (
          <>
            <Button size="sm" onClick={handleAddBlock}>
              Add block
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedBlockId}
              onClick={handleDeleteSelected}
            >
              Delete
            </Button>
          </>
        )}
        <span className={cn('text-xs text-muted-foreground', !readOnly && 'ml-auto')}>
          {readOnly ? 'View only' : 'Offline-first'} · {blockIds.length} block{blockIds.length === 1 ? '' : 's'}
        </span>
        {!readOnly && (
          <span className="hidden text-[11px] text-muted-foreground/80 lg:inline">
            {mod}Z undo · {mod}⇧Z redo · {mod}⇧N new · {mod}D duplicate · Esc deselect
          </span>
        )}
      </div>

      <div
        className="relative flex-1 overflow-auto bg-background bg-[linear-gradient(to_right,var(--canvas-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--canvas-grid)_1px,transparent_1px)] bg-size-[20px_20px]"
        style={{ backgroundSize: `${GRID_CELL_PX}px ${GRID_CELL_PX}px` }}
        onPointerDown={handleCanvasPointerDown}
      >
        <div className="relative min-h-full min-w-full" style={{ minHeight: 2400, minWidth: 3200 }}>
          {blockIds.map((id) => (
            <BlockItem key={id} id={id} readOnly={readOnly} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BlockItem({ id, readOnly }: { id: string; readOnly: boolean }) {
  const doc = useCanvasDoc();
  const block = useBlock(id);
  const selectedBlockId = useSelectedBlockId();
  const setSelectedBlockId = useCanvasStore((s) => s.setSelectedBlockId);
  const isSelected = selectedBlockId === id;

  const onSelect = useCallback(() => {
    setSelectedBlockId(id);
    if (!readOnly && doc) bringBlockToFront(doc, id);
  }, [doc, id, readOnly, setSelectedBlockId]);

  const commitPosition = useCallback(
    (x: number, y: number) => {
      if (readOnly || !doc) return;
      updateBlock(doc, id, { x, y });
    },
    [doc, id, readOnly],
  );

  const commitSize = useCallback(
    (w: number, h: number) => {
      if (readOnly || !doc) return;
      updateBlock(doc, id, { w, h });
    },
    [doc, id, readOnly],
  );

  const onBringToFront = useCallback(() => {
    if (readOnly || !doc) return;
    bringBlockToFront(doc, id);
  }, [doc, id, readOnly]);

  const onMove = useThrottledCallback(commitPosition, 50);
  const onResize = useThrottledCallback(commitSize, 50);

  const onContentChange = useCallback(
    (content: string) => {
      if (readOnly || !doc) return;
      updateBlock(doc, id, { content });
    },
    [doc, id, readOnly],
  );

  if (!block) return null;

  return (
    <BlockRenderer
      block={block}
      isSelected={isSelected}
      onSelect={onSelect}
      onMove={onMove}
      onMoveEnd={commitPosition}
      onResize={onResize}
      onResizeEnd={commitSize}
      onBringToFront={onBringToFront}
      onContentChange={onContentChange}
      readOnly={readOnly}
    />
  );
}
