import type { LayoutBlock, BlockType } from '@orbit/shared-types';
import * as Y from 'yjs';

export const LOCAL_ORIGIN = 'orbit-local';
export const META_KEY = 'meta';
export const BLOCKS_KEY = 'blocks';
export const NEXT_STACK_ORDER_KEY = 'nextStackOrder';

/**
 * CRDT vs Operational Transformation (OT)
 * ----------------------------------------
 * We use Y.js (CRDT) so merge/conflict resolution runs entirely in the browser.
 * OT would require a central server to order operations and resolve conflicts,
 * increasing latency, server CPU, and failure modes on unreliable networks.
 * Trade-off: CRDTs carry metadata overhead per edit, but that cost stays on the
 * client where we want compute anyway (local-first, PAT-001).
 */

export function createWorkspaceDoc(workspaceId: string): Y.Doc {
  const doc = new Y.Doc();
  const meta = doc.getMap(META_KEY);

  if (meta.size === 0) {
    doc.transact(() => {
      meta.set('workspaceId', workspaceId);
      meta.set('title', 'Untitled workspace');
      meta.set('version', 1);
      meta.set(NEXT_STACK_ORDER_KEY, 1);
    }, LOCAL_ORIGIN);
  }

  return doc;
}

export function allocateStackOrder(doc: Y.Doc): number {
  const meta = doc.getMap(META_KEY);
  const fromMeta = finiteNumber(meta.get(NEXT_STACK_ORDER_KEY)) ?? 1;
  const maxBlock = readAllBlocks(doc).reduce((max, block) => Math.max(max, block.stackOrder), 0);
  const order = Math.max(fromMeta, maxBlock + 1);

  doc.transact(() => {
    meta.set(NEXT_STACK_ORDER_KEY, order + 1);
  }, LOCAL_ORIGIN);

  return order;
}

/** Backfill stackOrder for blocks created before paint-order existed. */
export function ensureStackOrders(doc: Y.Doc): void {
  const meta = doc.getMap(META_KEY);
  const blocksMap = getBlocksMap(doc);
  let next = finiteNumber(meta.get(NEXT_STACK_ORDER_KEY)) ?? 1;
  let changed = false;

  doc.transact(() => {
    blocksMap.forEach((yBlock) => {
      if (!(yBlock instanceof Y.Map)) return;
      if (finiteNumber(yBlock.get('stackOrder')) !== null) return;
      yBlock.set('stackOrder', next);
      next += 1;
      changed = true;
    });

    if (changed) {
      meta.set(NEXT_STACK_ORDER_KEY, next);
    }
  }, LOCAL_ORIGIN);
}

export function getBlocksMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap(BLOCKS_KEY);
}

function isBlockType(value: unknown): value is BlockType {
  return value === 'text' || value === 'note' || value === 'embed';
}

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function blockToYMap(block: LayoutBlock): Y.Map<unknown> {
  const yBlock = new Y.Map<unknown>();
  yBlock.set('id', block.id);
  yBlock.set('type', block.type);
  yBlock.set('x', block.x);
  yBlock.set('y', block.y);
  yBlock.set('w', block.w);
  yBlock.set('h', block.h);
  yBlock.set('content', block.content);
  yBlock.set('stackOrder', block.stackOrder);
  yBlock.set('updatedAt', block.updatedAt);
  return yBlock;
}

export function yMapToBlock(yBlock: Y.Map<unknown>): LayoutBlock | null {
  const id = yBlock.get('id');
  const type = yBlock.get('type');

  if (typeof id !== 'string' || id.length === 0 || !isBlockType(type)) {
    return null;
  }

  const x = finiteNumber(yBlock.get('x')) ?? 0;
  const y = finiteNumber(yBlock.get('y')) ?? 0;
  const w = finiteNumber(yBlock.get('w')) ?? 1;
  const h = finiteNumber(yBlock.get('h')) ?? 1;
  const updatedAt = finiteNumber(yBlock.get('updatedAt')) ?? Date.now();
  const stackOrder = finiteNumber(yBlock.get('stackOrder')) ?? 0;

  return {
    id,
    type,
    x,
    y,
    w: Math.max(1, w),
    h: Math.max(1, h),
    content: String(yBlock.get('content') ?? ''),
    stackOrder,
    updatedAt,
  };
}

export function readAllBlocks(doc: Y.Doc): LayoutBlock[] {
  const blocksMap = getBlocksMap(doc);
  const blocks: LayoutBlock[] = [];

  blocksMap.forEach((yBlock) => {
    if (!(yBlock instanceof Y.Map)) return;
    const block = yMapToBlock(yBlock);
    if (block) blocks.push(block);
  });

  return blocks.sort((a, b) => a.stackOrder - b.stackOrder || a.updatedAt - b.updatedAt);
}

/**
 * Subscribe to structural + field-level block mutations. `doc.on('update')` alone
 * can miss timing windows around websocket merges, so the store listens here too.
 */
export function observeBlocks(doc: Y.Doc, onChange: () => void): () => void {
  const blocksMap = getBlocksMap(doc);
  const onDocUpdate = () => onChange();

  blocksMap.observeDeep(onChange);
  doc.on('update', onDocUpdate);

  return () => {
    blocksMap.unobserveDeep(onChange);
    doc.off('update', onDocUpdate);
  };
}

export function addBlock(doc: Y.Doc, block: LayoutBlock): void {
  const blocksMap = getBlocksMap(doc);
  const stackOrder =
    typeof block.stackOrder === 'number' && block.stackOrder > 0
      ? block.stackOrder
      : allocateStackOrder(doc);

  doc.transact(() => {
    blocksMap.set(block.id, blockToYMap({ ...block, stackOrder }));
    const meta = doc.getMap(META_KEY);
    const next = finiteNumber(meta.get(NEXT_STACK_ORDER_KEY)) ?? 1;
    if (stackOrder >= next) {
      meta.set(NEXT_STACK_ORDER_KEY, stackOrder + 1);
    }
  }, LOCAL_ORIGIN);
}

export interface UpdateBlockOptions {
  touchUpdatedAt?: boolean;
}

export function updateBlock(
  doc: Y.Doc,
  id: string,
  patch: Partial<Omit<LayoutBlock, 'id'>>,
  options: UpdateBlockOptions = {},
): void {
  const blocksMap = getBlocksMap(doc);
  const yBlock = blocksMap.get(id);
  if (!yBlock) return;
  const touchUpdatedAt = options.touchUpdatedAt !== false;

  doc.transact(() => {
    if (patch.type !== undefined) yBlock.set('type', patch.type);
    if (patch.x !== undefined) yBlock.set('x', patch.x);
    if (patch.y !== undefined) yBlock.set('y', patch.y);
    if (patch.w !== undefined) yBlock.set('w', patch.w);
    if (patch.h !== undefined) yBlock.set('h', patch.h);
    if (patch.content !== undefined) yBlock.set('content', patch.content);
    if (patch.stackOrder !== undefined) yBlock.set('stackOrder', patch.stackOrder);
    if (touchUpdatedAt) {
      yBlock.set('updatedAt', patch.updatedAt ?? Date.now());
    }
  }, LOCAL_ORIGIN);
}

export function bringBlockToFront(doc: Y.Doc, blockId: string): void {
  const stackOrder = allocateStackOrder(doc);
  updateBlock(doc, blockId, { stackOrder }, { touchUpdatedAt: false });
}

export function bringBlockAbove(doc: Y.Doc, blockId: string, aboveBlockId: string): void {
  const blocks = readAllBlocks(doc);
  const dragged = blocks.find((block) => block.id === blockId);
  const target = blocks.find((block) => block.id === aboveBlockId);
  if (!dragged || !target) return;
  if (dragged.stackOrder > target.stackOrder) return;
  bringBlockToFront(doc, blockId);
}

export function deleteBlock(doc: Y.Doc, id: string): void {
  const blocksMap = getBlocksMap(doc);
  doc.transact(() => {
    blocksMap.delete(id);
  }, LOCAL_ORIGIN);
}

/** Tracks local edits only — remote relay merges are not undoable. */
export function bindWorkspaceUndoManager(doc: Y.Doc): Y.UndoManager {
  const blocksMap = getBlocksMap(doc);
  const meta = doc.getMap(META_KEY);
  return new Y.UndoManager([blocksMap, meta], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
  });
}

export function duplicateBlock(doc: Y.Doc, id: string): LayoutBlock | null {
  const blocksMap = getBlocksMap(doc);
  const yBlock = blocksMap.get(id);
  if (!yBlock) return null;
  const source = yMapToBlock(yBlock);
  if (!source) return null;

  const copy = createDefaultBlock({
    type: source.type,
    x: source.x + 1,
    y: source.y + 1,
    w: source.w,
    h: source.h,
    content: source.content,
  });
  addBlock(doc, copy);
  bringBlockToFront(doc, copy.id);
  return copy;
}

export function createDefaultBlock(partial?: Partial<LayoutBlock>): LayoutBlock {
  const id = partial?.id ?? crypto.randomUUID();
  return {
    id,
    type: partial?.type ?? 'text',
    x: partial?.x ?? 2,
    y: partial?.y ?? 2,
    w: partial?.w ?? 8,
    h: partial?.h ?? 4,
    content: partial?.content ?? 'New block',
    stackOrder: partial?.stackOrder ?? 0,
    updatedAt: Date.now(),
  };
}

export function seedDemoBlockIfEmpty(doc: Y.Doc): void {
  if (readAllBlocks(doc).length > 0) return;
  const workspaceId = String(doc.getMap(META_KEY).get('workspaceId') ?? 'workspace');

  addBlock(
    doc,
    createDefaultBlock({
      id: `demo-${workspaceId}`,
      content: 'Welcome to Orbit — drag me, resize me, edit me offline.',
      x: 4,
      y: 4,
      w: 12,
      h: 5,
    }),
  );
}
