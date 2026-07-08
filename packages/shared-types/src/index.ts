export type BlockType = 'text' | 'note' | 'embed';

export interface LayoutBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  /** Monotonic paint order — higher values render above lower ones. */
  stackOrder: number;
  updatedAt: number;
}

export interface WorkspaceMeta {
  workspaceId: string;
  title: string;
  version: number;
}

export interface WsTicketClaims {
  sub: string;
  workspaceId: string;
  scopeId: string;
  exp: number;
}

export const GRID_CELL_PX = 20;
export const MIN_BLOCK_SIZE = 1;
