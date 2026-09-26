/**
 * BOARDS DATA MODEL & TYPES
 *
 * Independent top-level product area for visual spatial workspaces.
 * Completely separate from Reports, Report Editor, and Spreadsheet models.
 */

export type WidgetType = 'task' | 'note' | 'comment' | 'mindmap' | 'issue' | 'table';

export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskWidgetData {
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeUid?: string;
  assigneeEmail?: string;
  assigneeName?: string;
}

export interface NoteWidgetData {
  content: string;
  color?: string; // pastel background color e.g. yellow, blue, green, pink
}

export interface CommentWidgetData {
  text: string;
  author?: string;
  authorEmail?: string;
  createdAt: string;
}

export interface MindmapWidgetData {
  nodes: Array<{ id: string; label: string; x: number; y: number; color?: string; shape?: 'rounded' | 'pill' | 'square'; textColor?: 'default' | 'white' | 'black'; fontSize?: 'sm' | 'md' | 'lg' }>;
  edges: Array<{ id: string; source: string; target: string }>;
  background?: string;
}

export interface IssueWidgetData {
  issueId: string;
  title?: string;
  severity?: string;
  status?: string;
  description?: string;
  linkedReportId?: string | null;
}

export interface TableSnapshot {
  headers: string[];
  rows: string[][];
}

export interface TableWidgetData {
  tableId: string;
  reportId?: string;
  tableName?: string;
  /** 'smart' = live TableEntity reference, 'native' = frozen content snapshot. */
  kind?: 'smart' | 'native';
  snapshot?: TableSnapshot;
}

export interface BoardWidget {
  id: string;
  type: WidgetType;

  x: number;
  y: number;
  width: number;
  height: number;

  title?: string;
  data: TaskWidgetData | NoteWidgetData | CommentWidgetData | MindmapWidgetData | IssueWidgetData | TableWidgetData | Record<string, any>;
}

export type BoardType = 'canvas' | 'mindmap';

export interface BoardMindmapData {
  nodes: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    color?: string;
    shape?: 'rounded' | 'pill' | 'square';
    textColor?: 'default' | 'white' | 'black';
    fontSize?: 'sm' | 'md' | 'lg';
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    label?: string;
  }>;
  background?: string;
}

import type { DrawingElement, DrawingPoint } from './drawing/types';

/**
 * Board whiteboard shape — same field layout as the shared DrawingElement
 * (single source of truth in lib/drawing) plus board-only extras.
 */
export interface ExcalidrawElement {
  id: string;
  type: DrawingElement['type'] | 'image' | 'frame';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeStyle?: DrawingElement['strokeStyle'];
  opacity?: number;
  text?: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  points?: DrawingPoint[];
  imageData?: string;
  /** Rotation angle in degrees (0-360). */
  rotation?: number;
}

export interface BoardWhiteboardData {
  elements: ExcalidrawElement[];
  viewBackgroundColor?: string;
  zoom?: number;
  scrollX?: number;
  scrollY?: number;
  /** User-controlled frame height in px (null/undefined = fill viewport). */
  canvasHeight?: number | null;
}

export interface Board {
  id: string;
  title: string;
  type?: BoardType;

  widgets: BoardWidget[];
  mindmap?: BoardMindmapData;
  whiteboard?: BoardWhiteboardData;

  createdAt: string;
  updatedAt: string;

  isShared?: boolean;
  shareToken?: string | null;
  sharedAt?: string | null;

  archivedAt?: string;
  deletedAt?: string;
  trashExpiresAt?: string;
  ownerUid?: string;
  projectId?: string;
}

export interface BoardSession {
  openBoardIds: string[];
  activeBoardId: string | null;
}
