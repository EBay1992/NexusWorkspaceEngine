'use client';

import { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvas-store';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT' || target.isContentEditable;
}

function isModKey(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export interface CanvasShortcutActions {
  onAddBlock: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onDeselect: () => void;
}

export function useCanvasShortcuts(
  readOnly: boolean,
  actions: CanvasShortcutActions,
): void {
  const undoManager = useCanvasStore((s) => s.undoManager);
  const selectedBlockId = useCanvasStore((s) => s.selectedBlockId);

  useEffect(() => {
    if (readOnly) return;

    const {
      onAddBlock,
      onDeleteSelected,
      onDuplicateSelected,
      onDeselect,
    } = actions;

    const onKeyDown = (event: KeyboardEvent) => {
      const inField = isEditableTarget(event.target);
      const key = event.key.toLowerCase();

      if (inField) {
        if (isModKey(event) && (key === 'z' || key === 'y')) return;
        if (key === 'escape') return;
      }

      if (isModKey(event) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          undoManager?.redo();
        } else {
          undoManager?.undo();
        }
        return;
      }

      if (isModKey(event) && key === 'y') {
        event.preventDefault();
        undoManager?.redo();
        return;
      }

      if (key === 'escape') {
        event.preventDefault();
        onDeselect();
        return;
      }

      if (isModKey(event) && event.shiftKey && key === 'n') {
        event.preventDefault();
        onAddBlock();
        return;
      }

      if (isModKey(event) && key === 'd') {
        event.preventDefault();
        onDuplicateSelected();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedBlockId) {
        if (inField) return;
        event.preventDefault();
        onDeleteSelected();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, readOnly, selectedBlockId, undoManager]);
}

export function shortcutModLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘' : 'Ctrl';
}
