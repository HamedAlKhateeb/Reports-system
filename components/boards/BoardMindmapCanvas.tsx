'use client';

import React from 'react';
import { BoardCanvas } from './BoardCanvas';
import type { Board } from '@/lib/boards-types';

interface BoardMindmapCanvasProps {
  board: Board;
  onUpdateBoard?: (updatedBoard: Board) => void;
  lang?: 'ar' | 'en';
  onSwitchToCanvas?: () => void;
  onOpenShare?: () => void;
  readOnly?: boolean;
}

export function BoardMindmapCanvas(props: BoardMindmapCanvasProps) {
  return <BoardCanvas {...props} />;
}
