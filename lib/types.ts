export type { AppLanguage, IssueSeverity, IssueStatus } from './i18n/dictionary';
import { AppLanguage, IssueSeverity, IssueStatus } from './i18n/dictionary';
import { ContactLinkItem } from './contact-links';

export interface CustomFieldItem {
  id: string;
  label: string;
  value: string;
}

export interface AnalysisTableRow {
  id: string; // Row unique ID
  category: string; // التصنيف
  title: string; // المشكلة / الحالة المرصودة
  severity: 'حرجة' | 'كبيرة' | 'متوسطة' | 'عادية' | 'طفيفة'; // درجة المشكلة
  impact: string; // الأثر على المستخدم / الجودة
  recommendation: string; // التوصية المقترحة
  syncedIssueId?: string; // ID of the Kanban issue once pushed
  aspect?: string; // الجانب الخاضع للمراجعة
  attachment?: string; // الشكل / المرفق
}

export interface KanbanIssuePayload {
  title: string;
  description: string;
  severity: 'حرجة' | 'كبيرة' | 'متوسطة' | 'عادية' | 'طفيفة';
  status: 'مفتوحة';
  reportId: string;
  sourceSection: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  owner_id?: string;
  ownerUid?: string;
  status?: 'active' | 'archived' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface ReportItem {
  id: string;
  project_id?: string;
  projectId?: string;
  reportNumber: number | string;
  report_number?: number | string;
  title: string;
  report_type?: string;
  reportType?: string;
  language: AppLanguage; // Content language of this specific report
  version?: number | string;
  period_start?: string | null;
  period_end?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  author: string;
  author_id?: string;
  authorId?: string;
  authorTitle?: string;       // Job title / المنصب الوظيفي (e.g. مدقق جودة أول)
  organization?: string;      // Organization / Dept / الجهة أو القسم
  department?: string;        // Department / القسم أو الإدارة
  reviewer_id?: string;
  reviewerId?: string;
  reviewerName?: string;      // Reviewer or approver name / اسم المراجع أو المعتمد
  reviewerTitle?: string;     // Reviewer job title / المسمى الوظيفي للمعتمد
  reviewerEmail?: string;     // Reviewer email / البريد
  email?: string;             // Corporate / author contact email
  phone?: string;             // Phone number / الهاتف
  website?: string;           // Organization website / الموقع الإلكتروني
  projectUrl?: string;        // Project URL / رابط المشروع أو النظام
  repoUrl?: string;           // Git repository URL / رابط المستودع
  ticketsUrl?: string;        // Jira / Issues tracker URL / رابط التذاكر والمشاكل
  docsUrl?: string;           // Documentation URL / رابط الوثائق
  logoUrl?: string;           // Logo URL / رابط الشعار
  status?: 'draft' | 'in_review' | 'approved' | 'published' | 'archived';
  content?: any;
  last_sync_at?: string | null;
  lastSyncAt?: string | null;
  extraction_status?: 'idle' | 'scanning' | 'success' | 'failed' | 'stale';
  extractionStatus?: 'idle' | 'scanning' | 'success' | 'failed' | 'stale';
  signatureType?: 'text' | 'draw' | 'image'; // Type of signature
  signatureData?: string;     // Text representation, canvas data URL, or image URL
  themeColor?: string;        // 'olive' | 'blue' | 'slate' | 'emerald' | 'amber'
  backgroundColor?: string;   // 'white' | 'cream' | 'cool'
  contactLinks?: ContactLinkItem[]; // Optional contact & social media links
  customFields?: CustomFieldItem[]; // Dynamic custom metadata cards (top section)
  customFooterFields?: CustomFieldItem[]; // Dynamic custom sections (bottom / signature section)
  analysisRows?: AnalysisTableRow[]; // Structured rows from Analysis Table
  folderId?: string | null;   // null/undefined represents root/uncategorized
  shareToken?: string | null; // Unguessable random token for public read-only web view
  isShared?: boolean;         // Whether web sharing is active
  sharedAt?: string | null;   // When the report was last shared
  systemUnderReview?: string;
  fieldOverrides?: Record<string, FieldOverride>; // Non-destructive tracking of applied defaults
  contentJson?: any; // TipTap JSON
  ownerUid: string;
  createdAt: string; // ISO string or Firestore Timestamp
  updatedAt: string;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null; // null for root level
  color?: string;          // Optional accent color
  ownerUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;       // e.g. "rk_live_...4f8a"
  keyHash: string;         // SHA-256 hashed key
  ownerUid?: string;
  createdAt: string;
  lastUsedAt?: string | null;
  status: 'active' | 'revoked' | 'paused';
}

export interface ReportImage {
  id: string; // UUID
  reportId: string;
  index: number; // Global position in document
  url: string; // Cloudflare Images / R2 / Base64 / Local Blob
  caption?: string;
  createdAt: string;
}

export interface ReportImageItem {
  id: string;
  reportId: string;
  sequenceNumber: number; // Immutable automatic number (e.g. 1 -> صورة-1.png)
  fileName: string;       // e.g. "صورة-1.png"
  storagePath: string;
  downloadUrl: string;
  caption: string;        // Editable caption by user
  createdAt: string;
  index?: number;
}

export interface IssueItem {
  id: string;
  issue_key?: string; // e.g. "PRB-001"
  issueKey?: string;
  project_id?: string;
  projectId?: string;
  title: string;
  description: string;
  category?: string;
  severity: IssueSeverity | 'حرجة' | 'كبيرة' | 'متوسطة' | 'عادية' | 'طفيفة'; // 'critical' | 'major' | 'medium' | 'normal' | 'minor' or Arabic
  status: IssueStatus | 'مفتوحة' | 'قيد المعالجة' | 'مكتملة';     // 'open' | 'in_progress' | 'done' or Arabic aliases
  owner_id?: string;
  ownerUid?: string;
  due_date?: string | null;
  dueDate?: string | null;
  root_cause?: string;
  rootCause?: string;
  corrective_action?: string;
  correctiveAction?: string;
  preventive_action?: string;
  preventiveAction?: string;
  fingerprint?: string;
  first_detected_at?: string;
  firstDetectedAt?: string;
  resolved_at?: string | null;
  resolvedAt?: string | null;
  created_by?: string;
  createdBy?: string;
  archived_at?: string | null;
  archivedAt?: string | null;
  linkedReportId: string | null;
  reportId?: string; // Optional alias for linkedReportId
  sourceSection?: string; // e.g. "جدول البيانات والتحليل - تصنيف: أداء النظام"
  order?: number; // Position index for vertical drag & drop reordering
  createdAt: string;
  updatedAt: string;
  commentsCount?: number;
}

export interface ReportIssueItem {
  id?: string;
  report_id: string;
  reportId?: string;
  issue_id: string;
  issueId?: string;
  source_section_id?: string;
  source_block_id?: string;
  source_row_id?: string;
  source_cell_range?: string;
  evidence_id?: string;
  relation_type: 'primary' | 'reference' | 'snapshot';
  created_at: string;
}

export interface EvidenceItem {
  id: string;
  report_id: string;
  reportId?: string;
  issue_id: string;
  issueId?: string;
  type: 'text' | 'image' | 'table_row' | 'cell_range' | 'file';
  text_excerpt?: string;
  file_url?: string;
  page_number?: number;
  block_id?: string;
  created_at: string;
}

export type GridCellType =
  | 'text'
  | 'number'
  | 'integer'
  | 'decimal'
  | 'date'
  | 'datetime'
  | 'percentage'
  | 'currency'
  | 'status'
  | 'category'
  | 'issue_key';

export interface TableColumnConfig {
  id: string;
  name: string;
  type: GridCellType;
  width?: number;
  format?: string;
}

export type TableColumnEntity = TableColumnConfig;

export interface TableEntity {
  id: string;
  report_id: string;
  reportId?: string;
  name: string;
  direction?: 'rtl' | 'ltr';
  schema?: TableColumnConfig[];
  columns_data: TableColumnConfig[];
  rows_data: Array<Record<string, any>>;
  cell_formats?: Record<string, any>;
  merged_cells?: Array<{ start: string; end: string; rowSpan?: number; colSpan?: number }>;
  version: number;
  created_at: string;
  updated_at: string;
}

export type TablePlacement = {
  tableId: string;
  reportId: string;
  blockId: string;
  position: number;
  placement: 'embedded';
};

export type SmartColumn = {
  id: string;
  key: string;
  title: string;
  dataType: 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'formula';
  width: number;
  hidden?: boolean;
};

export type SmartCell = {
  value: string | number | boolean | null;
  formula?: string;
  computedValue?: string | number | boolean | null;
  format?: {
    numberFormat?: string;
    textColor?: string;
    backgroundColor?: string;
    bold?: boolean;
    italic?: boolean;
    horizontalAlign?: 'left' | 'center' | 'right';
    wrapText?: boolean;
  };
  error?: 'VALUE' | 'REF' | 'DIV0' | 'NAME' | 'CIRCULAR';
};

export type SmartRow = {
  id: string;
  cells: Record<string, SmartCell>;
};

export type SmartTable = {
  id: string;
  reportId: string;
  name: string;
  direction: 'rtl' | 'ltr';
  columns: SmartColumn[];
  rows: SmartRow[];
  frozenRows: number;
  frozenColumns: number;
  version: number;
  updatedAt: string;
};

export type TableOperation =
  | { type: 'set-cell'; cellId: string; before: SmartCell; after: SmartCell }
  | { type: 'fill-range'; before: SmartCell[][]; after: SmartCell[][] }
  | { type: 'insert-row'; index: number }
  | { type: 'delete-row'; index: number; row: SmartRow }
  | { type: 'insert-column'; index: number }
  | { type: 'delete-column'; index: number; column: SmartColumn };

export type FieldSource = 'report' | 'organization_default' | 'user_profile';

export interface FieldOverride {
  field: string;
  previousValue: string | null;
  previousSource: FieldSource;
  newValue: string | null;
  sourceAfterApply: FieldSource;
  appliedAt: string;
}

export interface OrganizationDefaultsItem {
  id: string;
  ownerUid?: string;
  organization: string;
  department?: string;
  author?: string;
  authorTitle?: string;
  reviewerName?: string;
  reviewerTitle?: string;
  email?: string;
  phone?: string;
  website?: string;
  projectUrl?: string;
  repoUrl?: string;
  ticketsUrl?: string;
  docsUrl?: string;
  logoUrl?: string;
  signatureData?: string;
  autoApplyToNewReports: boolean;
  enabledFields: Record<string, boolean>;
  updatedAt: string;
}


export type DashboardScopeType = 'report' | 'project' | 'organization' | 'personal';
export type DashboardScope = DashboardScopeType;

export interface DashboardItem {
  id: string;
  name: string;
  title?: string;
  scope_type: DashboardScopeType;
  scope?: DashboardScopeType;
  scope_id: string; // reportId, projectId, or userId
  owner_id?: string;
  ownerUid?: string;
  layout?: any;
  layout_config?: any;
  created_at: string;
  updated_at: string;
}

export type DashboardEntity = DashboardItem;

export type WidgetSourceType = 'report_table' | 'project_issues' | 'report_issues' | 'cell_range' | 'metric';
export type WidgetVisualizationType =
  | 'kpi'
  | 'table'
  | 'bar'
  | 'line'
  | 'area'
  | 'donut'
  | 'timeline'
  | 'heatmap'
  | 'insight';
export type WidgetRefreshMode = 'live' | 'manual' | 'scheduled';

export interface WidgetQueryConfig {
  source: {
    type: WidgetSourceType;
    reportId?: string;
    projectId?: string;
    tableId?: string;
    cellRange?: string;
    field?: string;
    ownerUid?: string;
    orgId?: string;
  };
  dimension?: string;
  measure?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'percentage';
  measureField?: string;
  filters?: Array<{
    field: string;
    operator: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt' | 'contains';
    value: any;
  }>;
  groupBy?: 'day' | 'week' | 'month' | 'severity' | 'category' | 'status' | 'owner';
  visualization?: WidgetVisualizationType;
  refreshMode?: WidgetRefreshMode;
}

export interface WidgetEntity {
  id: string;
  dashboard_id: string;
  dashboardId?: string;
  title: string;
  type?: WidgetVisualizationType;
  visualization_type: WidgetVisualizationType;
  source_type: WidgetSourceType;
  source_id?: string;
  source_title?: string;
  source_config?: any;
  query_definition?: string;
  query_config: WidgetQueryConfig;
  refresh_mode?: WidgetRefreshMode;
  last_calculated_at?: string;
  calculation_status?: 'success' | 'stale' | 'calculating' | 'error' | 'no_data' | 'unauthorized';
  cached_result?: any;
  created_at?: string;
  updated_at?: string;
}

export interface InsightEntity {
  id: string;
  dashboard_id: string;
  dashboardId?: string;
  title: string;
  type?: string;
  summary?: string;
  observation: string;
  interpretation?: string;
  recommendation?: string;
  recommendations?: string[];
  severity?: string;
  confidence: 'high' | 'medium' | 'low';
  source_widget_ids?: string[];
  source_issue_ids?: string[];
  source_report_ids?: string[];
  status: 'draft' | 'proposed' | 'approved' | 'dismissed';
  suggested_owner?: string;
  timeframe?: string;
  created_by?: string;
  created_at: string;
}

export interface AuditEventItem {
  id: string;
  actor_id: string;
  actor_email?: string;
  entity_type: 'issue' | 'report' | 'table' | 'dashboard' | 'widget' | 'insight' | 'project';
  entity_id: string;
  action: 'create' | 'update' | 'archive' | 'restore' | 'merge' | 'approve' | 'recalculate' | 'export';
  before_value?: any;
  after_value?: any;
  reason?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface AiProposalItem {
  id: string;
  report_id?: string;
  project_id?: string;
  entity_type: 'issue' | 'report' | 'table' | 'insight';
  entity_id?: string;
  action: 'create' | 'update' | 'merge' | 'archive';
  title: string;
  description: string;
  evidence: {
    source_quotes?: string[];
    table_cell_ref?: string;
    similarity_score?: number;
    rule_citation?: string;
    rationale: string;
  };
  before_value?: any;
  after_value: any;
  confidence: 'high' | 'medium' | 'low';
  status: ProposalStatus;
  user_decision_note?: string;
  decided_by?: string;
  decided_at?: string;
  created_at: string;
}

export interface CommentItem {
  id: string;
  issueId: string;
  body: string;
  authorUid: string;
  authorEmail: string;
  authorName?: string;
  createdAt: string;
}

export interface AuthorizedUser {
  email: string;
  role?: 'admin' | 'reviewer';
  addedAt?: string;
}

export interface SeverityConfigItem {
  id: IssueSeverity;
  order: number; // 1, 2, 3, 4, 5
  labelAr: string;
  labelEn: string;
}
