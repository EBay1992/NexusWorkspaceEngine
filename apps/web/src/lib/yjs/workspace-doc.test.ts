import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addBlock,
  bindWorkspaceUndoManager,
  bringBlockAbove,
  bringBlockToFront,
  createDefaultBlock,
  createWorkspaceDoc,
  deleteBlock,
  duplicateBlock,
  readAllBlocks,
  updateBlock,
} from './workspace-doc';

describe('workspace-doc', () => {
  it('creates meta for a new workspace', () => {
    const doc = createWorkspaceDoc('ws-1');
    const meta = doc.getMap('meta');
    expect(meta.get('workspaceId')).toBe('ws-1');
    expect(meta.get('version')).toBe(1);
  });

  it('adds, updates, and deletes blocks', () => {
    const doc = createWorkspaceDoc('ws-1');
    const block = createDefaultBlock({ id: 'block-1', content: 'Hello' });

    addBlock(doc, block);
    expect(readAllBlocks(doc)).toHaveLength(1);
    expect(readAllBlocks(doc)[0].content).toBe('Hello');
    expect(readAllBlocks(doc)[0].stackOrder).toBeGreaterThan(0);

    updateBlock(doc, 'block-1', { content: 'Updated', x: 5 });
    const updated = readAllBlocks(doc)[0];
    expect(updated.content).toBe('Updated');
    expect(updated.x).toBe(5);

    deleteBlock(doc, 'block-1');
    expect(readAllBlocks(doc)).toHaveLength(0);
  });

  it('promotes a block above another and to the front', () => {
    const doc = createWorkspaceDoc('ws-1');
    addBlock(doc, createDefaultBlock({ id: 'a', stackOrder: 1 }));
    addBlock(doc, createDefaultBlock({ id: 'b', stackOrder: 2 }));

    bringBlockAbove(doc, 'a', 'b');
    const blocks = readAllBlocks(doc);
    expect(blocks.find((block) => block.id === 'a')?.stackOrder).toBeGreaterThan(
      blocks.find((block) => block.id === 'b')?.stackOrder ?? 0,
    );

    bringBlockToFront(doc, 'b');
    const reordered = readAllBlocks(doc);
    expect(reordered.at(-1)?.id).toBe('b');
  });

  it('stores blocks as nested Y.Map structures', () => {
    const doc = createWorkspaceDoc('ws-1');
    addBlock(doc, createDefaultBlock({ id: 'a' }));

    const blocksMap = doc.getMap('blocks') as Y.Map<Y.Map<unknown>>;
    expect(blocksMap.has('a')).toBe(true);
    expect(blocksMap.get('a')?.get('id')).toBe('a');
  });

  it('undoes and redoes local block edits', () => {
    const doc = createWorkspaceDoc('ws-1');
    const undoManager = bindWorkspaceUndoManager(doc);

    addBlock(doc, createDefaultBlock({ id: 'a', content: 'Hello' }));
    undoManager.stopCapturing();
    updateBlock(doc, 'a', { content: 'Changed' });
    expect(readAllBlocks(doc)[0].content).toBe('Changed');

    undoManager.undo();
    expect(readAllBlocks(doc)[0].content).toBe('Hello');

    undoManager.redo();
    expect(readAllBlocks(doc)[0].content).toBe('Changed');
  });

  it('does not undo remote-origin updates', () => {
    const doc = createWorkspaceDoc('ws-1');
    const undoManager = bindWorkspaceUndoManager(doc);

    addBlock(doc, createDefaultBlock({ id: 'a', content: 'Local' }));
    undoManager.stopCapturing();

    doc.transact(() => {
      doc.getMap('blocks').get('a')?.set('content', 'Remote');
    }, 'remote-peer');

    undoManager.stopCapturing();
    updateBlock(doc, 'a', { content: 'Patched' });
    expect(readAllBlocks(doc)[0].content).toBe('Patched');

    undoManager.undo();
    expect(readAllBlocks(doc)[0].content).toBe('Remote');
  });

  it('duplicates a block with a new id and offset position', () => {
    const doc = createWorkspaceDoc('ws-1');
    addBlock(
      doc,
      createDefaultBlock({ id: 'a', content: 'Note', x: 3, y: 4, w: 6, h: 3 }),
    );

    const copy = duplicateBlock(doc, 'a');
    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe('a');
    expect(copy?.content).toBe('Note');
    expect(copy?.x).toBe(4);
    expect(copy?.y).toBe(5);
    expect(readAllBlocks(doc)).toHaveLength(2);
  });
});
