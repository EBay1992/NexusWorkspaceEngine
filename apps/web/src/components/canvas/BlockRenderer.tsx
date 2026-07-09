'use client';

import type { LayoutBlock } from '@orbit/shared-types';
import { GRID_CELL_PX, MIN_BLOCK_SIZE } from '@orbit/shared-types';
import { useCallback, useEffect, useRef } from 'react';
import { useBlockPosition, useCanvasStore, useDraggingBlockId } from '@/stores/canvas-store';
import { BlockEditor } from './BlockEditor';
import { cn } from '@/lib/utils';

type DragMode = 'move' | 'resize-se';

interface BlockRendererProps {
  block: LayoutBlock;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onMoveEnd: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onResizeEnd: (w: number, h: number) => void;
  onBringToFront: () => void;
  onContentChange: (content: string) => void;
  readOnly?: boolean;
}

function snapDelta(value: number): number {
  return Math.round(value);
}

function snapPosition(value: number): number {
  return Math.max(0, Math.round(value));
}

export function BlockRenderer({
  block,
  isSelected,
  onSelect,
  onMove,
  onMoveEnd,
  onResize,
  onResizeEnd,
  onBringToFront,
  onContentChange,
  readOnly = false,
}: BlockRendererProps) {
  const position = useBlockPosition(block.id);
  const draggingBlockId = useDraggingBlockId();
  const setDraggingBlockId = useCanvasStore((s) => s.setDraggingBlockId);
  const rootRef = useRef<HTMLDivElement>(null);
  const isDragging = draggingBlockId === block.id;
  const isBlockedByDrag = draggingBlockId !== null && draggingBlockId !== block.id;

  const safeX = Number.isFinite(position?.x ?? block.x) ? Math.max(0, position?.x ?? block.x) : 0;
  const safeY = Number.isFinite(position?.y ?? block.y) ? Math.max(0, position?.y ?? block.y) : 0;
  const safeW = Number.isFinite(position?.w ?? block.w)
    ? Math.max(MIN_BLOCK_SIZE, position?.w ?? block.w)
    : MIN_BLOCK_SIZE;
  const safeH = Number.isFinite(position?.h ?? block.h)
    ? Math.max(MIN_BLOCK_SIZE, position?.h ?? block.h)
    : MIN_BLOCK_SIZE;
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originW: number;
    originH: number;
  } | null>(null);

  const onMoveRef = useRef(onMove);
  const onMoveEndRef = useRef(onMoveEnd);
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);
  const onBringToFrontRef = useRef(onBringToFront);

  useEffect(() => {
    onMoveRef.current = onMove;
    onMoveEndRef.current = onMoveEnd;
    onResizeRef.current = onResize;
    onResizeEndRef.current = onResizeEnd;
    onBringToFrontRef.current = onBringToFront;
  }, [onBringToFront, onMove, onMoveEnd, onResize, onResizeEnd]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDraggingBlockId(null);
  }, [setDraggingBlockId]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = snapDelta((event.clientX - drag.startX) / GRID_CELL_PX);
      const dy = snapDelta((event.clientY - drag.startY) / GRID_CELL_PX);

      if (drag.mode === 'move') {
        onMoveRef.current(
          snapPosition(drag.originX + dx),
          snapPosition(drag.originY + dy),
        );
      } else {
        onResizeRef.current(
          Math.max(MIN_BLOCK_SIZE, snapPosition(drag.originW + dx)),
          Math.max(MIN_BLOCK_SIZE, snapPosition(drag.originH + dy)),
        );
      }
    };

    const finishDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const dx = snapDelta((event.clientX - drag.startX) / GRID_CELL_PX);
        const dy = snapDelta((event.clientY - drag.startY) / GRID_CELL_PX);
        if (drag.mode === 'move') {
          onMoveEndRef.current(
            snapPosition(drag.originX + dx),
            snapPosition(drag.originY + dy),
          );
          onBringToFrontRef.current();
        } else {
          onResizeEndRef.current(
            Math.max(MIN_BLOCK_SIZE, snapPosition(drag.originW + dx)),
            Math.max(MIN_BLOCK_SIZE, snapPosition(drag.originH + dy)),
          );
        }
      }
      endDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [endDrag]);

  const startDrag = useCallback(
    (event: React.PointerEvent, mode: DragMode) => {
      if (readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      onSelect();
      setDraggingBlockId(block.id);
      rootRef.current?.setPointerCapture(event.pointerId);

      dragRef.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        originX: safeX,
        originY: safeY,
        originW: safeW,
        originH: safeH,
      };
    },
    [block.id, onSelect, readOnly, safeH, safeW, safeX, safeY, setDraggingBlockId],
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute flex flex-col rounded-lg border bg-card shadow-sm transition-shadow',
        isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
        isDragging && 'cursor-grabbing shadow-lg',
        isBlockedByDrag && 'pointer-events-none',
        readOnly && 'cursor-default',
        block.type === 'note' && 'bg-amber-50 dark:bg-amber-950/30',
      )}
      style={{
        left: safeX * GRID_CELL_PX,
        top: safeY * GRID_CELL_PX,
        width: safeW * GRID_CELL_PX,
        height: safeH * GRID_CELL_PX,
        zIndex: block.stackOrder,
        touchAction: isDragging ? 'none' : undefined,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (isBlockedByDrag) return;
        onSelect();
      }}
      onLostPointerCapture={() => {
        if (dragRef.current) endDrag();
      }}
    >
      <div
        className={cn(
          'flex items-center justify-between border-b border-border/60 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground',
          !readOnly && 'cursor-grab active:cursor-grabbing',
        )}
        onPointerDown={(e) => startDrag(e, 'move')}
      >
        <span>{block.type}</span>
        <span className="font-mono">{block.id.slice(0, 6)}</span>
      </div>

      <div className="flex min-h-0 flex-1 p-2">
        <BlockEditor
          value={block.content}
          onChange={onContentChange}
          onFocus={onSelect}
          isSelected={isSelected}
          readOnly={readOnly}
        />
      </div>

      {isSelected && !readOnly && (
        <div
          className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-sm border border-primary bg-primary"
          onPointerDown={(e) => startDrag(e, 'resize-se')}
          aria-label="Resize block"
        />
      )}
    </div>
  );
}
