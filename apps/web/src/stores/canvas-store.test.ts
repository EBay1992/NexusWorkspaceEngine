import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addBlock,
  createDefaultBlock,
  createWorkspaceDoc,
  updateBlock,
} from '@/lib/yjs/workspace-doc';
import {
  useBlock,
  useBlockIds,
  useCanvasStore,
} from '@/stores/canvas-store';

async function flushStore(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

describe('canvas-store selectors', () => {
  it('isolates block updates so unrelated selectors stay stable', async () => {
    const doc = createWorkspaceDoc('ws-test');
    addBlock(doc, createDefaultBlock({ id: 'a', content: 'A', x: 1 }));
    addBlock(doc, createDefaultBlock({ id: 'b', content: 'B', x: 2 }));

    const unbind = useCanvasStore.getState().bindDoc(doc);

    const blockARender = vi.fn();
    const blockBRender = vi.fn();

    const { rerender } = renderHook(
      ({ aId, bId }: { aId: string; bId: string }) => {
        const a = useBlock(aId);
        const b = useBlock(bId);
        blockARender(a?.content);
        blockBRender(b?.content);
        return { a, b };
      },
      { initialProps: { aId: 'a', bId: 'b' } },
    );

    blockARender.mockClear();
    blockBRender.mockClear();

    act(() => {
      updateBlock(doc, 'a', { content: 'A-updated' });
    });
    await flushStore();

    rerender({ aId: 'a', bId: 'b' });

    expect(blockARender).toHaveBeenCalled();
    const lastA = blockARender.mock.calls.at(-1)?.[0];
    expect(lastA).toBe('A-updated');

    const bCallsAfterUpdate = blockBRender.mock.calls.filter(([content]) => content === 'B');
    expect(bCallsAfterUpdate.length).toBeGreaterThan(0);

    unbind();
  });

  it('tracks block id list', () => {
    const doc = createWorkspaceDoc('ws-test-2');
    addBlock(doc, createDefaultBlock({ id: 'x' }));
    addBlock(doc, createDefaultBlock({ id: 'y' }));

    const unbind = useCanvasStore.getState().bindDoc(doc);

    const { result } = renderHook(() => useBlockIds());
    expect(result.current).toEqual(expect.arrayContaining(['x', 'y']));
    expect(result.current).toHaveLength(2);

    unbind();
  });

  it('updates blockIds when a block is added after bind', async () => {
    const doc = createWorkspaceDoc('ws-test-3');
    const unbind = useCanvasStore.getState().bindDoc(doc);

    const { result } = renderHook(() => useBlockIds());
    expect(result.current).toHaveLength(0);

    act(() => {
      addBlock(doc, createDefaultBlock({ id: 'new-block' }));
    });
    await flushStore();

    expect(result.current).toContain('new-block');
    expect(result.current).toHaveLength(1);

    unbind();
  });

  it('updates blockIds when a remote peer update adds a block', async () => {
    const docA = createWorkspaceDoc('ws-remote');
    const docB = createWorkspaceDoc('ws-remote');
    addBlock(docB, createDefaultBlock({ id: 'remote-1', content: 'from peer' }));
    const update = Y.encodeStateAsUpdate(docB);

    const unbind = useCanvasStore.getState().bindDoc(docA);
    const { result } = renderHook(() => useBlockIds());
    expect(result.current).toHaveLength(0);

    act(() => {
      Y.applyUpdate(docA, update, 'remote-peer');
    });
    await flushStore();

    expect(result.current).toContain('remote-1');
    expect(result.current).toHaveLength(1);

    unbind();
  });
});
