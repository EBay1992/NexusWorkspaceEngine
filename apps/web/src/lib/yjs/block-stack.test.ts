import { describe, expect, it } from 'vitest';
import type { LayoutBlock } from '@orbit/shared-types';
import { findTopBlockAtPoint } from './block-stack';

function block(partial: Partial<LayoutBlock> & Pick<LayoutBlock, 'id'>): LayoutBlock {
  return {
    type: 'text',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    content: '',
    stackOrder: 1,
    updatedAt: 0,
    ...partial,
  };
}

describe('block-stack', () => {
  it('returns the highest stackOrder block at a grid point', () => {
    const blocks = [
      block({ id: 'a', x: 0, y: 0, stackOrder: 1 }),
      block({ id: 'b', x: 0, y: 0, stackOrder: 5 }),
      block({ id: 'c', x: 10, y: 10, stackOrder: 9 }),
    ];

    expect(findTopBlockAtPoint(blocks, 1, 1, 'self')?.id).toBe('b');
    expect(findTopBlockAtPoint(blocks, 11, 11, 'self')?.id).toBe('c');
    expect(findTopBlockAtPoint(blocks, 1, 1, 'b')?.id).toBe('a');
  });
});
