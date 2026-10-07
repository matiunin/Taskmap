import { useState, useCallback } from 'react';

interface UseUndoRedoOptions<T> {
  maxHistory?: number;
}

interface UseUndoRedoReturn<T> {
  state: T | undefined;
  history: T[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  push: (state: T) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

export function useUndoRedo<T>(
  initialState?: T,
  options: UseUndoRedoOptions<T> = {}
): UseUndoRedoReturn<T> {
  const { maxHistory = 50 } = options;
  
  const [history, setHistory] = useState<T[]>(
    initialState !== undefined ? [initialState] : []
  );
  const [historyIndex, setHistoryIndex] = useState(
    initialState !== undefined ? 0 : -1
  );

  const state = historyIndex >= 0 ? history[historyIndex] : undefined;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const push = useCallback((newState: T) => {
    setHistory(prev => {
      // Remove any future states (redo history) when pushing new state
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newState);
      
      // Limit history size
      if (newHistory.length > maxHistory) {
        return newHistory.slice(-maxHistory);
      }
      return newHistory;
    });
    setHistoryIndex(prev => {
      const newIndex = prev + 1;
      return newIndex >= maxHistory ? maxHistory - 1 : newIndex;
    });
  }, [historyIndex, maxHistory]);

  const undo = useCallback(() => {
    if (canUndo) {
      setHistoryIndex(prev => prev - 1);
    }
  }, [canUndo]);

  const redo = useCallback(() => {
    if (canRedo) {
      setHistoryIndex(prev => prev + 1);
    }
  }, [canRedo]);

  const clear = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  return {
    state,
    history,
    historyIndex,
    canUndo,
    canRedo,
    push,
    undo,
    redo,
    clear,
  };
}

export default useUndoRedo;
