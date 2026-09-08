/**
 * AI Governance & Insights Engine
 * Strict Enterprise Principles:
 * 1. No silent AI changes (Analyze -> Propose -> Evidence -> User Approval -> Execute -> Audit Log).
 * 2. Full Audit Trail for all AI proposals, approvals, and mutations.
 * 3. Automated Intelligence Insights generation across document, table, and Kanban metrics.
 */

import {
  AiProposalItem,
  ProposalStatus,
  AuditEventItem,
  InsightEntity,
  IssueItem,
  ReportItem,
  TableEntity,
} from '@/lib/types';
import {
  recordAuditEvent,
  getAuditEvents,
  createIssue,
  updateIssue,
  archiveIssue,
  updateReport,
  saveTable,
  getIssues,
  saveInsight,
  getInsights,
} from '@/lib/db';

const LOCAL_AI_PROPOSALS_KEY = 'review_app_ai_proposals';

function getLocalProposals(): AiProposalItem[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_AI_PROPOSALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalProposals(proposals: AiProposalItem[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_AI_PROPOSALS_KEY, JSON.stringify(proposals));
  } catch {}
}

/**
 * 1. CREATE AI PROPOSAL
 * Enforces evidence, rationale, and pending status. No silent execution.
 */
export async function createAiProposal(
  data: Omit<AiProposalItem, 'id' | 'status' | 'created_at'>,
  actorId: string = 'ai_analyst'
): Promise<AiProposalItem> {
  if (!data.evidence?.rationale) {
    throw new Error('AI Proposals must provide clear evidence and a rationale.');
  }

  const now = new Date().toISOString();
  const id = 'prop_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  const proposal: AiProposalItem = {
    ...data,
    id,
    status: 'pending',
    created_at: now,
  };

  const list = getLocalProposals();
  setLocalProposals([proposal, ...list]);

  // Record audit log for proposal generation
  await recordAuditEvent({
    actor_id: actorId,
    entity_type: data.entity_type,
    entity_id: id,
    action: 'create',
    after_value: {
      action: data.action,
      title: data.title,
      confidence: data.confidence,
    },
    reason: `AI Proposal Generated: ${data.evidence.rationale}`,
    metadata: {
      proposal_id: id,
      target_entity_id: data.entity_id,
      confidence: data.confidence,
    },
  });

  return proposal;
}

/**
 * 2. APPROVE AI PROPOSAL
 * Explicit user approval required. Executes mutation and records full audit log.
 */
export async function approveAiProposal(
  proposalId: string,
  actorId: string,
  userDecisionNote?: string
): Promise<{ success: boolean; executedResult: any; auditEvent: AuditEventItem }> {
  const list = getLocalProposals();
  const proposalIndex = list.findIndex((p) => p.id === proposalId);

  if (proposalIndex === -1) {
    throw new Error(`Proposal with ID ${proposalId} not found.`);
  }

  const proposal = list[proposalIndex];
  if (proposal.status !== 'pending') {
    throw new Error(`Proposal ${proposalId} cannot be approved because it is already ${proposal.status}.`);
  }

  const now = new Date().toISOString();
  let executedResult: any = null;

  // Execute mutation according to entity type and action
  if (proposal.entity_type === 'issue') {
    if (proposal.action === 'create') {
      executedResult = await createIssue({
        ...proposal.after_value,
        ownerUid: actorId,
      });
    } else if (proposal.action === 'update' && proposal.entity_id) {
      executedResult = await updateIssue(proposal.entity_id, proposal.after_value);
    } else if (proposal.action === 'archive' && proposal.entity_id) {
      executedResult = await archiveIssue(
        proposal.entity_id,
        actorId,
        userDecisionNote || proposal.evidence.rationale
      );
    }
  } else if (proposal.entity_type === 'report' && proposal.entity_id) {
    executedResult = await updateReport(proposal.entity_id, proposal.after_value);
  } else if (proposal.entity_type === 'table') {
    executedResult = await saveTable(proposal.after_value);
  }

  // Mark proposal as applied
  const updatedProposal: AiProposalItem = {
    ...proposal,
    status: 'applied',
    decided_by: actorId,
    decided_at: now,
    user_decision_note: userDecisionNote,
  };

  list[proposalIndex] = updatedProposal;
  setLocalProposals(list);

  // Write comprehensive audit log
  const auditEvent = await recordAuditEvent({
    actor_id: actorId,
    entity_type: proposal.entity_type,
    entity_id: proposal.entity_id || proposal.id,
    action: proposal.action === 'archive' ? 'archive' : 'update',
    before_value: proposal.before_value,
    after_value: proposal.after_value,
    reason: userDecisionNote || proposal.evidence.rationale,
    metadata: {
      proposal_id: proposal.id,
      ai_confidence: proposal.confidence,
      evidence: proposal.evidence,
      approved_by: actorId,
      status: 'applied',
    },
  });

  return {
    success: true,
    executedResult,
    auditEvent,
  };
}

/**
 * 3. REJECT AI PROPOSAL
 * Rejects proposal and records audit log.
 */
export async function rejectAiProposal(
  proposalId: string,
  actorId: string,
  reason?: string
): Promise<{ success: boolean; auditEvent: AuditEventItem }> {
  const list = getLocalProposals();
  const proposalIndex = list.findIndex((p) => p.id === proposalId);

  if (proposalIndex === -1) {
    throw new Error(`Proposal with ID ${proposalId} not found.`);
  }

  const proposal = list[proposalIndex];
  if (proposal.status !== 'pending') {
    throw new Error(`Proposal ${proposalId} cannot be rejected because it is already ${proposal.status}.`);
  }

  const now = new Date().toISOString();
  const updatedProposal: AiProposalItem = {
    ...proposal,
    status: 'rejected',
    decided_by: actorId,
    decided_at: now,
    user_decision_note: reason,
  };

  list[proposalIndex] = updatedProposal;
  setLocalProposals(list);

  const auditEvent = await recordAuditEvent({
    actor_id: actorId,
    entity_type: proposal.entity_type,
    entity_id: proposal.id,
    action: 'update',
    reason: reason || 'Proposal rejected by user',
    metadata: {
      proposal_id: proposal.id,
      rejected_by: actorId,
      status: 'rejected',
    },
  });

  return {
    success: true,
    auditEvent,
  };
}

/**
 * 4. GET AI PROPOSALS
 */
export async function getAiProposals(filter?: {
  reportId?: string;
  projectId?: string;
  status?: ProposalStatus;
}): Promise<AiProposalItem[]> {
  const all = getLocalProposals();
  return all.filter((p) => {
    if (filter?.status && p.status !== filter.status) return false;
    if (filter?.reportId && p.report_id !== filter.reportId) return false;
    if (filter?.projectId && p.project_id !== filter.projectId) return false;
    return true;
  });
}

/**
 * 5. AUTOMATED INSIGHTS GENERATION ENGINE
 * Analyzes patterns and generates actionable insights with evidence and recommendations.
 */
export async function generateAutomatedInsights(
  scope: {
    reportId?: string;
    projectId?: string;
    dashboardId?: string;
  },
  userUid?: string
): Promise<InsightEntity[]> {
  const rawIssues = await getIssues(userUid);
  const activeIssues = rawIssues.filter((i) => !i.archived_at && !i.archivedAt);

  // Filter issues based on scope
  const targetIssues = activeIssues.filter((i) => {
    if (scope.reportId) {
      return i.linkedReportId === scope.reportId || i.reportId === scope.reportId;
    }
    if (scope.projectId) {
      return i.project_id === scope.projectId || (i as any).projectId === scope.projectId;
    }
    return true;
  });

  const generatedInsights: InsightEntity[] = [];
  const now = new Date().toISOString();
  const targetDashboardId = scope.dashboardId || (scope.reportId ? `dash_report_${scope.reportId}` : `dash_project_${scope.projectId || 'default'}`);

  if (targetIssues.length === 0) {
    return [];
  }

  // 1. Check for Critical Risk Concentration
  const criticalIssues = targetIssues.filter(
    (i) => i.severity === 'critical' || i.severity === 'حرجة'
  );
  const criticalRatio = criticalIssues.length / targetIssues.length;

  if (criticalIssues.length >= 2 || criticalRatio >= 0.25) {
    const insight: InsightEntity = {
      id: `ins_crit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      dashboard_id: targetDashboardId,
      title: 'تركيز مرتفع للمشاكل الحرجة (Critical Risk Concentration)',
      observation: `تم رصد ${criticalIssues.length} مشاكل حرجة تشكل ${Math.round(criticalRatio * 100)}% من إجمالي بنود النطاق.`,
      interpretation: 'وجود نسبة مرتفعة من المشاكل الحرجة يشير إلى احتمالية وجود خلل معماري أو ثغرة أساسية تؤثر على الاستقرار العام.',
      recommendation: 'إعطاء الأولوية القصوى لمعالجة المشاكل الحرجة قبل الشروع في تطوير ميزات جديدة.',
      recommendations: [
        'تخصيص فريق الاستجابة السريعة للتركيز على المشاكل الحرجة.',
        'إيقاف نشر التحديثات غير الأساسية حتى استقرار مؤشرات الخطورة.',
      ],
      type: 'risk_concentration',
      severity: 'critical',
      confidence: 'high',
      source_issue_ids: criticalIssues.map((i) => i.id),
      status: 'proposed',
      created_at: now,
    };
    await saveInsight(insight);
    generatedInsights.push(insight);
  }

  // 2. Check for Workflow Bottlenecks (In Progress > Done)
  const inProgressIssues = targetIssues.filter(
    (i) => i.status === 'in_progress' || (i.status as any) === 'قيد المعالجة' || (i.status as any) === 'قيد التنفيذ'
  );
  const doneIssues = targetIssues.filter(
    (i) => i.status === 'done' || (i.status as any) === 'مكتملة'
  );

  if (inProgressIssues.length > 3 && inProgressIssues.length > doneIssues.length * 1.5) {
    const insight: InsightEntity = {
      id: `ins_bottle_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      dashboard_id: targetDashboardId,
      title: 'عنق زجاجة في مسار التنفيذ (Workflow Bottleneck)',
      observation: `يوجد ${inProgressIssues.length} مهام قيد المعالجة مقارنة بـ ${doneIssues.length} مهام مكتملة فقط.`,
      interpretation: 'تراكم المهام في مرحلة التنفيذ يرفع من تكلفة التحويل بين المهام ويؤخر سرعة التسليم.',
      recommendation: 'تطبيق مبدأ تحديد العمل قيد الإنجاز (WIP Limits) والتركيز على إنهاء المهام المفتوحة قبل سحب مهام جديدة.',
      recommendations: [
        'مراجعة المعوقات التي تواجه المهام قيد التنفيذ حالياً.',
        'إعادة توزيع المهام بين أعضاء الفريق لتسريع الإغلاق.',
      ],
      type: 'workflow_bottleneck',
      severity: 'major',
      confidence: 'medium',
      source_issue_ids: inProgressIssues.map((i) => i.id),
      status: 'proposed',
      created_at: now,
    };
    await saveInsight(insight);
    generatedInsights.push(insight);
  }

  // 3. Category Clustering (e.g., performance or security)
  const categoryCounts: Record<string, number> = {};
  targetIssues.forEach((i) => {
    const cat = i.category || 'عام';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const dominantCategory = Object.entries(categoryCounts).find(
    ([_, count]) => count >= 3 && count / targetIssues.length >= 0.4
  );

  if (dominantCategory) {
    const [catName, catCount] = dominantCategory;
    const catIssues = targetIssues.filter((i) => (i.category || 'عام') === catName);

    const insight: InsightEntity = {
      id: `ins_cluster_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      dashboard_id: targetDashboardId,
      title: `تكتل المشاكل في تصنيف: ${catName} (Category Clustering)`,
      observation: `يتركز ${catCount} بنود في التصنيف "${catName}" بما يمثل ${Math.round((catCount / targetIssues.length) * 100)}% من المشاكل.`,
      interpretation: `المشاكل في هذا التصنيف ذات طبيعة مشتركة وتستدعي حلاً جذرياً بدلاً من معالجة كل بند على حدة.`,
      recommendation: `إجراء جلسة تدقيق متخصصة لمكونات "${catName}" لمعالجة السبب الجذري.`,
      recommendations: [
        `فحص الكود والبنية التحتية المرتبطة بـ ${catName}.`,
        'إضافة اختبارات آلية لمنع تكرار الأخطاء في هذا المكون.',
      ],
      type: 'category_clustering',
      severity: 'medium',
      confidence: 'high',
      source_issue_ids: catIssues.map((i) => i.id),
      status: 'proposed',
      created_at: now,
    };
    await saveInsight(insight);
    generatedInsights.push(insight);
  }

  return generatedInsights;
}

/**
 * 6. GET AUDIT LOG
 */
export async function getAuditLog(filter?: {
  entityId?: string;
  entityType?: string;
  actorId?: string;
}): Promise<AuditEventItem[]> {
  const allEvents = await getAuditEvents(filter?.entityType, filter?.entityId);
  if (filter?.actorId) {
    return allEvents.filter((e) => e.actor_id === filter.actorId);
  }
  return allEvents;
}
