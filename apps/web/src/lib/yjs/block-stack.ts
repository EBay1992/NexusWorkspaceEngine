import type { LayoutBlock } from '@orbit/shared-types';

export function findTopBlockAtPoint(
  blocks: LayoutBlock[],
  gridX: number,
  gridY: number,
  excludeId: string,
): LayoutBlock | null {
  let top: LayoutBlock | null = null;

  for (const block of blocks) {
    if (block.id === excludeId) continue;
    if (
      gridX >= block.x &&
      gridX < block.x + block.w &&
      gridY >= block.y &&
      gridY < block.y + block.h
    ) {
      if (!top || block.stackOrder > top.stackOrder) {
        top = block;
      }
    }
  }

  return top;
}

export function clientPointToGrid(
  canvasEl: HTMLElement,
  clientX: number,
  clientY: number,
  gridCellPx: number,
): { gridX: number; gridY: number } {
  const rect = canvasEl.getBoundingClientRect();
  return {
    gridX: (clientX - rect.left + canvasEl.scrollLeft) / gridCellPx,
    gridY: (clientY - rect.top + canvasEl.scrollTop) / gridCellPx,
  };
}
