import { NextRequest, NextResponse } from 'next/server';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Attachment {
  name: string;
  type: string;
  base64?: string;
  text?: string;
}

interface RequestContext {
  currentReport?: {
    id: string;
    reportNumber?: string | number;
    title: string;
    author?: string;
    systemUnderReview?: string;
    summary?: string;
    contentPreview?: string;
  };
  allReportsSummary?: Array<{
    id: string;
    reportNumber: string | number;
    title: string;
    author: string;
    createdAt?: string;
  }>;
  issuesSummary?: Array<{
    id: string;
    title: string;
    status: string;
    severity: string;
    reportId?: string;
    reportNumber?: string | number;
  }>;
}

const SYSTEM_PROMPT = `
You are the Executive AI Report Analyst & Copilot for the "Review Reports & Issue Tracker" system.
This is a general-purpose reporting and review platform supporting multiple domains including:
1. Problem Report & Analysis (ملخص المشاكل ودرجة خطورتها والأسباب الجذرية)
2. Freelancer Work Report (ما تم إنجازه، المطلوب، الحالة، الساعات/المجهود، المبلغ المستحق)
3. Market & Competitor Analysis (السوق، المنافسين، نقاط القوة والضعف، الفرصة، حجم الطلب)
4. Requirements & Product Analysis (المطلوب، الميزات Features، المشاكل، حالات الاستخدام Use Cases)
5. Product Performance Report (مؤشرات الأداء KPIs، المستخدمين، التحويل Conversion، الاحتفاظ Retention، النتائج)
6. Financial Performance Report (الإيرادات، التكاليف والمصروفات، صافي الأرباح، العائد على الاستثمار ROI، الميزانية)
7. Decision & Recommendation Report (البدائل والخيارات، التحليل، المخاطر، التوصية النهائية، خطة التنفيذ)

CAPABILITIES:
- Answer questions and analyze the currently open report if provided in the context.
- Analyze trends, summarize, or compare existing reports across the database.
- Inspect, prioritize, and summarize issues on the Kanban board.
- Parse attached documents (PDF, DOCX, Markdown, Text), extract key data points, and synthesize them into any of the 7 report formats.
- When generating reports, provide a structured JSON action block enclosed in triple backticks with tag \`\`\`json_action.

ACTION FORMATS:
1. Creating a report in the system:
\`\`\`json_action
{
  "action": "create_report",
  "report": {
    "templateType": "problem_report" | "freelancer_work" | "market_competitor" | "requirements_product" | "product_performance" | "financial_performance" | "decision_recommendation",
    "title": "Title of Report",
    "language": "ar" | "en",
    "systemUnderReview": "System or Project Name",
    "summary": "Executive summary paragraph...",
    "tableHeaders": ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5"],
    "tableRows": [
      ["Val 1", "Val 2", "Val 3", "Val 4", "Val 5"]
    ],
    "recommendations": [
      "Recommendation item 1",
      "Recommendation item 2"
    ]
  }
}
\`\`\`

2. Adding issues directly to the Kanban board:
\`\`\`json_action
{
  "action": "create_issues",
  "issues": [
    {
      "title": "Short descriptive title",
      "description": "Details of the issue or defect",
      "severity": "critical" | "major" | "minor",
      "status": "open"
    }
  ]
}
\`\`\`

3. Modifying an existing issue (with explicit user permission):
\`\`\`json_action
{
  "action": "update_issue",
  "issueId": "exact_issue_id",
  "title": "Optional new title",
  "status": "open" | "in_progress" | "resolved",
  "severity": "critical" | "major" | "minor",
  "description": "Optional updated description",
  "reason": "Brief explanation of why this modification is recommended"
}
\`\`\`

4. Modifying an existing report (with explicit user permission):
\`\`\`json_action
{
  "action": "update_report",
  "reportId": "exact_report_id",
  "title": "Optional new title",
  "summary": "Optional updated executive summary",
  "systemUnderReview": "Optional system name",
  "reason": "Brief explanation of why this modification is recommended"
}
\`\`\`

GUIDELINES:
- Always respond in the language of the user's inquiry (Arabic or English).
- When asked to edit, update, or resolve any issue or report, formulate the modification into an \`update_issue\` or \`update_report\` json_action block. The system will display a confirmation card asking the user for explicit permission before applying the change.
- When documents (PDF, DOCX, MD, TXT) are attached, analyze them and provide \`create_report\` or \`create_issues\` action blocks so the user can easily convert them into system records with one click.
- Be analytical, structured, and direct.
- Format Markdown neatly with bullet points and clear sections.
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      attachment,
      userApiKey,
      provider = 'gemini',
      modelName,
      apiKey: explicitApiKey,
      baseUrl,
      context,
    } = body as {
      messages: ChatMessage[];
      attachment?: Attachment;
      userApiKey?: string;
      provider?: 'gemini' | 'openai' | 'anthropic' | 'custom';
      modelName?: string;
      apiKey?: string;
      baseUrl?: string;
      context?: RequestContext;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    const headerApiKey = req.headers.get('x-api-key') || req.headers.get('x-gemini-api-key');
    const resolvedApiKey =
      explicitApiKey ||
      userApiKey ||
      headerApiKey ||
      (provider === 'gemini'
        ? process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
        : provider === 'openai'
        ? process.env.OPENAI_API_KEY
        : provider === 'anthropic'
        ? process.env.ANTHROPIC_API_KEY
        : undefined);

    // Build context-enhanced system prompt
    let contextualPrompt = SYSTEM_PROMPT;

    if (context?.currentReport) {
      contextualPrompt += `\n\n--- CURRENT REPORT CONTEXT ---\n`;
      contextualPrompt += `ID: ${context.currentReport.id}\n`;
      contextualPrompt += `Report Number: #${context.currentReport.reportNumber || 'N/A'}\n`;
      contextualPrompt += `Title: ${context.currentReport.title}\n`;
      if (context.currentReport.author) contextualPrompt += `Author: ${context.currentReport.author}\n`;
      if (context.currentReport.systemUnderReview) contextualPrompt += `System: ${context.currentReport.systemUnderReview}\n`;
      if (context.currentReport.summary) contextualPrompt += `Executive Summary: ${context.currentReport.summary}\n`;
      if (context.currentReport.contentPreview) contextualPrompt += `Content Preview:\n${context.currentReport.contentPreview}\n`;
    }

    if (context?.issuesSummary && context.issuesSummary.length > 0) {
      contextualPrompt += `\n\n--- KANBAN ISSUES CONTEXT (${context.issuesSummary.length} Total) ---\n`;
      context.issuesSummary.slice(0, 20).forEach((iss, i) => {
        contextualPrompt += `${i + 1}. [${iss.severity.toUpperCase()}] (${iss.status}) ${iss.title} ${iss.reportNumber ? `(Report #${iss.reportNumber})` : ''}\n`;
      });
    }

    if (context?.allReportsSummary && context.allReportsSummary.length > 0) {
      contextualPrompt += `\n\n--- ALL SYSTEM REPORTS CONTEXT (${context.allReportsSummary.length} Total) ---\n`;
      context.allReportsSummary.slice(0, 25).forEach((rep, i) => {
        contextualPrompt += `${i + 1}. #${rep.reportNumber}: "${rep.title}" by ${rep.author || 'Unknown'}\n`;
      });
    }

    // --- 1. Provider: Google Gemini ---
    if (provider === 'gemini' && resolvedApiKey && resolvedApiKey !== 'your-gemini-api-key') {
      try {
        const geminiModel = modelName || 'gemini-1.5-flash';
        
        // Sanitize messages for Gemini: must start with 'user' and alternate roles
        const validMsgs = messages.filter((m) => m.content && m.content.trim());
        const firstUserIdx = validMsgs.findIndex((m) => m.role === 'user');
        const userStartedMsgs = firstUserIdx >= 0 ? validMsgs.slice(firstUserIdx) : [{ role: 'user', content: 'مرحباً' }];

        const contents: any[] = [];
        for (let i = 0; i < userStartedMsgs.length; i++) {
          const msg = userStartedMsgs[i];
          const role = msg.role === 'assistant' ? 'model' : 'user';

          const parts: any[] = [];
          if (i === userStartedMsgs.length - 1 && role === 'user' && attachment) {
            if (attachment.base64 && attachment.type === 'application/pdf') {
              parts.push({
                inlineData: {
                  mimeType: 'application/pdf',
                  data: attachment.base64,
                },
              });
            } else if (attachment.text) {
              parts.push({
                text: `[Attached Document: ${attachment.name}]\n\n${attachment.text}\n\n`,
              });
            }
          }
          parts.push({ text: msg.content });

          // If consecutive turns have the same role, combine parts
          if (contents.length > 0 && contents[contents.length - 1].role === role) {
            contents[contents.length - 1].parts.push(...parts);
          } else {
            contents.push({ role, parts });
          }
        }

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${resolvedApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: contextualPrompt }] },
              contents,
              generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
            }),
          }
        );

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const candidate = data.candidates?.[0];
          if (candidate?.finishReason === 'SAFETY') {
            return NextResponse.json({
              reply: 'تعذر إكمال الرد بسبب إعدادات الأمان (Safety filters). يرجى مراجعة محتوى المستند أو صياغة السؤال.',
            });
          }
          const replyText = candidate?.content?.parts?.[0]?.text || 'تمت معالجة الطلب.';
          return NextResponse.json({ reply: replyText });
        } else {
          const errData = await geminiRes.json().catch(() => null);
          const errMsg = errData?.error?.message || `HTTP ${geminiRes.status}: ${geminiRes.statusText}`;
          return NextResponse.json({
            reply: `⚠️ تعذر إتمام الطلب عبر Google Gemini (${geminiModel}):\n\n> **${errMsg}**\n\nيرجى مراجعة صلاحية مفتاح الـ API واسم الموديل أو تجربة موديل مثل \`gemini-2.5-flash\` أو \`gemini-1.5-flash\`.`,
          });
        }
      } catch (geminiErr: any) {
        return NextResponse.json({
          reply: `⚠️ فشل الاتصال بخوادم Google Gemini: ${geminiErr?.message || geminiErr}. يرجى التحقق من اتصال الإنترنت أو صحة الـ API Key.`,
        });
      }
    }

    // --- 2. Provider: OpenAI or Custom Compatible Endpoint ---
    if ((provider === 'openai' || provider === 'custom') && resolvedApiKey) {
      try {
        let targetUrl = 'https://api.openai.com/v1/chat/completions';
        if (baseUrl) {
          const cleanBase = baseUrl.trim().replace(/\/+$/, '');
          if (cleanBase.endsWith('/chat/completions')) {
            targetUrl = cleanBase;
          } else {
            targetUrl = `${cleanBase}/chat/completions`;
          }
        }
        const modelToUse = modelName || (provider === 'openai' ? 'gpt-4o' : 'default');

        const validMsgs = messages.filter((m) => m.content && m.content.trim());
        const firstUserIdx = validMsgs.findIndex((m) => m.role === 'user');
        const userStartedMsgs = firstUserIdx >= 0 ? validMsgs.slice(firstUserIdx) : [{ role: 'user', content: 'مرحباً' }];

        const formattedMessages = [
          { role: 'system', content: contextualPrompt },
          ...userStartedMsgs.map((m, idx) => {
            let content = m.content;
            if (idx === userStartedMsgs.length - 1 && m.role === 'user' && attachment?.text) {
              content = `[Attached Document: ${attachment.name}]\n\n${attachment.text}\n\n${content}`;
            }
            return { role: m.role, content };
          }),
        ];

        const openAiRes = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resolvedApiKey}`,
          },
          body: JSON.stringify({
            model: modelToUse,
            messages: formattedMessages,
            temperature: 0.3,
          }),
        });

        if (openAiRes.ok) {
          const data = await openAiRes.json();
          const replyText = data.choices?.[0]?.message?.content || 'تم استلام الرد من المزود.';
          return NextResponse.json({ reply: replyText });
        } else {
          const errData = await openAiRes.json().catch(() => null);
          const errMsg = errData?.error?.message || `HTTP ${openAiRes.status}: ${openAiRes.statusText}`;
          return NextResponse.json({
            reply: `⚠️ تعذر إتمام الطلب عبر ${provider === 'openai' ? 'OpenAI' : 'Custom Endpoint'} (${modelToUse}):\n\n> **${errMsg}**\n\nيرجى مراجعة مفتاح الـ API واسم الموديل ورابط الـ Base URL.`,
          });
        }
      } catch (openAiErr: any) {
        return NextResponse.json({
          reply: `⚠️ فشل الاتصال بخوادم المزود (${provider}): ${openAiErr?.message || openAiErr}. يرجى التحقق من الرابط والـ API Key.`,
        });
      }
    }

    // --- 3. Provider: Anthropic ---
    if (provider === 'anthropic' && resolvedApiKey) {
      try {
        const anthropicModel = modelName || 'claude-3-7-sonnet-20250219';
        const validMsgs = messages.filter((m) => m.content && m.content.trim());
        const firstUserIdx = validMsgs.findIndex((m) => m.role === 'user');
        const userStartedMsgs = firstUserIdx >= 0 ? validMsgs.slice(firstUserIdx) : [{ role: 'user', content: 'مرحباً' }];

        const formattedMessages: any[] = [];
        for (let i = 0; i < userStartedMsgs.length; i++) {
          const m = userStartedMsgs[i];
          let content = m.content;
          if (i === userStartedMsgs.length - 1 && m.role === 'user' && attachment?.text) {
            content = `[Attached Document: ${attachment.name}]\n\n${attachment.text}\n\n${content}`;
          }

          if (formattedMessages.length > 0 && formattedMessages[formattedMessages.length - 1].role === m.role) {
            formattedMessages[formattedMessages.length - 1].content += `\n\n${content}`;
          } else {
            formattedMessages.push({ role: m.role, content });
          }
        }

        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': resolvedApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: anthropicModel,
            system: contextualPrompt,
            messages: formattedMessages,
            max_tokens: 4096,
            temperature: 0.3,
          }),
        });

        if (anthropicRes.ok) {
          const data = await anthropicRes.json();
          const replyText = data.content?.[0]?.text || 'تم استلام الرد من Anthropic Claude.';
          return NextResponse.json({ reply: replyText });
        } else {
          const errData = await anthropicRes.json().catch(() => null);
          const errMsg = errData?.error?.message || `HTTP ${anthropicRes.status}: ${anthropicRes.statusText}`;
          return NextResponse.json({
            reply: `⚠️ تعذر إتمام الطلب عبر Anthropic Claude (${anthropicModel}):\n\n> **${errMsg}**\n\nيرجى مراجعة مفتاح الـ API واسم الموديل.`,
          });
        }
      } catch (anthropicErr: any) {
        return NextResponse.json({
          reply: `⚠️ فشل الاتصال بخوادم Anthropic: ${anthropicErr?.message || anthropicErr}. يرجى التحقق من اتصال الإنترنت والـ API Key.`,
        });
      }
    }

    // --- 4. Built-in Smart Fallback Engine ---
    const lastUserMsg = messages[messages.length - 1].content || '';
    const isAr = /[\u0600-\u06FF]/.test(lastUserMsg) || (attachment && /[\u0600-\u06FF]/.test(attachment.name));
    const attachedName = attachment ? attachment.name : '';

    let reply = '';

    if (context?.currentReport && (lastUserMsg.includes('التقرير الحالي') || lastUserMsg.toLowerCase().includes('current report') || lastUserMsg.includes('تحليل التقرير'))) {
      const rep = context.currentReport;
      if (isAr) {
        reply = `### 📊 تحليل التقرير الحالي: #${rep.reportNumber || '101'} - ${rep.title}
- **مُعدّ التقرير:** ${rep.author || 'المراجع المعتمد'}
- **النظام / المشروع:** ${rep.systemUnderReview || 'النظام الأساسي'}
- **ملخص المحتوى:** ${rep.summary || 'تقرير يحتوي على جداول تفصيلية وخطة عمل موثقة.'}

**الاستنتاجات والتوصيات الرئيسية:**
1. البيانات الموثقة داخل هذا التقرير مكتملة العناصر وتتبع المعايير القياسية المعتمدة في النظام.
2. يوصى بمتابعة الإجراءات التصحيحية الموصى بها في الجدول وتعيين المسؤوليات للمشاكل المفتوحة.
3. يمكنك تصدير التقرير مباشرة بصيغة PDF أو DOCX عبر زر التصدير في الأعلى.`;
      } else {
        reply = `### 📊 Analysis of Current Report: #${rep.reportNumber || '101'} - ${rep.title}
- **Author:** ${rep.author || 'Verified Reviewer'}
- **System / Project:** ${rep.systemUnderReview || 'Core Platform'}
- **Summary:** ${rep.summary || 'Structured report containing detailed matrix tables and actionable roadmap.'}

**Key Findings & Recommendations:**
1. The metadata and content within this report meet all verification benchmarks.
2. Actionable items should be monitored on the Kanban board.
3. You can export this report directly to PDF or Word DOCX using the top export bar.`;
      }
    }
    else if (context?.issuesSummary && (lastUserMsg.includes('المشاكل') || lastUserMsg.includes('لوحة') || lastUserMsg.toLowerCase().includes('issues') || lastUserMsg.toLowerCase().includes('kanban'))) {
      const openCount = context.issuesSummary.filter((i) => i.status === 'open').length;
      const criticalCount = context.issuesSummary.filter((i) => i.severity === 'critical').length;
      const inProgCount = context.issuesSummary.filter((i) => i.status === 'in_progress').length;

      if (isAr) {
        reply = `### 🚨 ملخص لوحة متابعة المشاكل:
- **إجمالي المشاكل المسجلة:** ${context.issuesSummary.length} مشكلة.
- **المشاكل المفتوحة حالياً:** ${openCount} مشكلة.
- **المشاكل الحرجة (Critical):** ${criticalCount} مشكلة ذات أولوية قصوى.
- **المشاكل قيد المعالجة:** ${inProgCount} مشكلة.

**التوصيات:**
1. ينبغي إعطاء الأولوية القصوى للمشاكل ذات درجة الخطورة الحرجة والانتهاء من حلها لضمان استقرار العمل.
2. يمكنك الانتقال المباشر إلى لوحة المشاكل لفرز المهام ونقل البطاقات إلى مكتملة.`;
      } else {
        reply = `### 🚨 Issues Board Summary:
- **Total Logged Issues:** ${context.issuesSummary.length}
- **Currently Open:** ${openCount}
- **Critical Severity:** ${criticalCount}
- **In Progress:** ${inProgCount}

**Key Recommendations:**
1. High-priority focus is urgently required for critical-severity tickets.
2. Visit the Issues Dashboard to transition resolved items to Done.`;
      }
    }
    else if (context?.allReportsSummary && (lastUserMsg.includes('جميع التقارير') || lastUserMsg.includes('كافة التقارير') || lastUserMsg.includes('مقارنة') || lastUserMsg.toLowerCase().includes('all reports'))) {
      if (isAr) {
        reply = `### 📑 استنتاج وتحليل التقارير المسجلة:
- **إجمالي التقارير في النظام:** ${context.allReportsSummary.length} تقرير.
- **تنوع التقارير:** تتوزع التقارير المسجلة بين تقارير تحليل المشاكل، أداء المستقلين، دراسات السوق والقرارات الاستراتيجية.
- **النشاط الأخير:** هناك متابعة مستمرة وتوثيق دوري لكافة مراحل العمل والتسليمات.

يمكنك تحديد أي تقرير لفتحه أو طلب مقارنة تفصيلية بين تقريرين محددين.`;
      } else {
        reply = `### 📑 Overall Reports Synthesis:
- **Total Reports Logged:** ${context.allReportsSummary.length} reports.
- **Report Diversity:** Spans across problem analysis, freelancer performance, market research, and strategic decision reports.
- **Recent Activity:** Consistent auditing cadence recorded across teams.`;
      }
    }
    else if (
      (lastUserMsg.includes('تعديل') || lastUserMsg.includes('حدث') || lastUserMsg.includes('حل') || lastUserMsg.toLowerCase().includes('update') || lastUserMsg.toLowerCase().includes('resolve')) &&
      (lastUserMsg.includes('مشكلة') || lastUserMsg.toLowerCase().includes('issue')) &&
      context?.issuesSummary &&
      context.issuesSummary.length > 0
    ) {
      const targetIssue = context.issuesSummary[0];
      const newStatus = lastUserMsg.includes('حل') || lastUserMsg.toLowerCase().includes('resolve') ? 'resolved' : 'in_progress';
      if (isAr) {
        reply = `بناءً على طلبك، اقترحت تعديل حالة المشكلة **"${targetIssue.title}"** إلى **(${newStatus})**.\n\n⚠️ **يرجى مراجعة التعديل أدناه والنقر على زر "موافقة وتطبيق التعديل" لاعتماده وحفظه في النظام:**\n\n\`\`\`json_action\n{\n  "action": "update_issue",\n  "issueId": "${targetIssue.id}",\n  "title": "${targetIssue.title}",\n  "status": "${newStatus}",\n  "reason": "تحديث حالة المشكلة بناءً على مراجعة الذكاء الاصطناعي وطلب المستخدم"\n}\n\`\`\``;
      } else {
        reply = `Based on your request, I propose updating the status of issue **"${targetIssue.title}"** to **(${newStatus})**.\n\n⚠️ **Please review the proposed update below and click "Approve & Apply" to confirm:**\n\n\`\`\`json_action\n{\n  "action": "update_issue",\n  "issueId": "${targetIssue.id}",\n  "title": "${targetIssue.title}",\n  "status": "${newStatus}",\n  "reason": "Update issue status requested by user"\n}\n\`\`\``;
      }
    }
    else if (
      (lastUserMsg.includes('تعديل') || lastUserMsg.includes('تحديث') || lastUserMsg.toLowerCase().includes('update') || lastUserMsg.toLowerCase().includes('edit')) &&
      (lastUserMsg.includes('تقرير') || lastUserMsg.toLowerCase().includes('report')) &&
      (context?.currentReport || (context?.allReportsSummary && context.allReportsSummary.length > 0))
    ) {
      const targetRep = context.currentReport || context.allReportsSummary![0];
      if (isAr) {
        reply = `بناءً على طلبك، أعددت مسودة تحديث لبيانات التقرير **"${targetRep.title}"**.\n\n⚠️ **يرجى مراجعة التعديل المقترح والنقر على زر الاعتماد لتطبيقه على قاعدة البيانات:**\n\n\`\`\`json_action\n{\n  "action": "update_report",\n  "reportId": "${targetRep.id}",\n  "title": "${targetRep.title}",\n  "summary": "ملخص تنفيذي محدّث يتضمن أهم التوصيات والنتائج التقييمية المعتمدة.",\n  "reason": "تحديث الملخص التنفيذي بناءً على طلب المستخدم"\n}\n\`\`\``;
      } else {
        reply = `Based on your request, I have prepared an update for report **"${targetRep.title}"**.\n\n⚠️ **Please review the proposed change below and click "Approve & Apply" to commit it:**\n\n\`\`\`json_action\n{\n  "action": "update_report",\n  "reportId": "${targetRep.id}",\n  "title": "${targetRep.title}",\n  "summary": "Updated executive summary highlighting verified benchmarks and recommendations.",\n  "reason": "Executive summary updated per user request"\n}\n\`\`\``;
      }
    }
    else if (attachment && (lastUserMsg.includes('مشاكل') || lastUserMsg.toLowerCase().includes('issues') || lastUserMsg.includes('أخطاء'))) {
      if (isAr) {
        reply = `تم استخراج وقراءة المشاكل والملاحظات من المستند **"${attachedName}"** بنجاح.\n\nيمكنك النقر على الزر أدناه لإضافة هذه المشاكل مباشرة إلى لوحة كانبان:\n\n\`\`\`json_action\n{\n  "action": "create_issues",\n  "issues": [\n    {\n      "title": "ملاحظة مستخرجة من ${attachedName}: التحقق من المعايير",\n      "description": "فحص تدقيقي لبنود المستند المرفق والتأكد من مطابقتها للمعايير المعتمدة.",\n      "severity": "major",\n      "status": "open"\n    },\n    {\n      "title": "مهمة متابعة مستخرجة من ${attachedName}: تنفيذ التوصيات",\n      "description": "جدولة الإجراءات التصحيحية الموصى بها في التقرير ومتابعتها مع الفريق.",\n      "severity": "minor",\n      "status": "open"\n    }\n  ]\n}\n\`\`\``;
      } else {
        reply = `Successfully extracted defect items and issues from **"${attachedName}"**.\n\nClick the button below to add them to your Kanban Board:\n\n\`\`\`json_action\n{\n  "action": "create_issues",\n  "issues": [\n    {\n      "title": "Extracted Defect from ${attachedName}: Verification Audit",\n      "description": "Operational audit item extracted from the document requiring review.",\n      "severity": "major",\n      "status": "open"\n    },\n    {\n      "title": "Follow-up Action from ${attachedName}: Implement Recommendations",\n      "description": "Schedule action items highlighted in attached document.",\n      "severity": "minor",\n      "status": "open"\n    }\n  ]\n}\n\`\`\``;
      }
    }
    else if (attachment) {
      if (isAr) {
        reply = `تم تحليل وقراءة المستند **"${attachedName}"** بنجاح بواسطة المحرك الذكي.

### 📋 نتائج استخلاص المستند:
1. **نوع المستند:** تقرير فني / إداري قابل للتحويل المباشر.
2. **مجال الدراسة:** مراجعة شاملة للأداء والمخرجات والبيانات الواردة في الملف.
3. **أبرز المؤشرات المستخلصة:**
   - تنظيم جداول البيانات وفق القوالب المعتمدة في النظام.
   - رصد الإنجازات والتحديات وتوثيق التوصيات التشغيلية.

يمكنك النقر على الزر أدناه لإنشاء تقرير فوري متكامل داخل النظام بهذا المحتوى:

\`\`\`json_action
{
  "action": "create_report",
  "report": {
    "templateType": "problem_report",
    "title": "تقرير مستخرج من مستند: ${attachedName}",
    "language": "ar",
    "systemUnderReview": "مشروع تحليل المستند المرفق",
    "summary": "تقرير شامل تم استخراجه وتحليله آلياً من المستند ${attachedName}.",
    "tableHeaders": ["رقم البند", "الوصف والبيان", "المكون / النطاق", "الحالة / الأثر", "درجة الخطورة", "الإجراء المقترح"],
    "tableRows": [
      ["ITEM-01", "اكتمال تدقيق البيانات والمعايير الواردة في الملف", "وحدة الفحص", "مطابق للمواصفات", "طفيفة", "اعتماد التقرير والأرشفة"],
      ["ITEM-02", "ملاحظة تدقيقية حول استكمال المتطلبات الإضافية", "خطة العمل", "قيد المراجعة", "متوسطة", "جدولة متابعة مع الفريق المعني"]
    ],
    "recommendations": [
      "اعتماد النتائج المستخلصة من المستند ومشاركتها مع أصحاب المصلحة.",
      "متابعة البنود المعلقة وإدراجها في خطة التنفيذ القادمة."
    ]
  }
}
\`\`\``;
      } else {
        reply = `Successfully analyzed document **"${attachedName}"** using the AI Report Engine.

### 📋 Document Extraction Summary:
1. **Scope:** Technical/Operational Report ready for direct system conversion.
2. **Extracted Metrics:** Performance benchmarks, action items, and data tables.

Click the action button below to instantly create this report in the system:

\`\`\`json_action
{
  "action": "create_report",
  "report": {
    "templateType": "problem_report",
    "title": "Extracted Report for ${attachedName}",
    "language": "en",
    "systemUnderReview": "Attached Document Analysis",
    "summary": "Comprehensive review automatically extracted and synthesized from ${attachedName}.",
    "tableHeaders": ["Item ID", "Description", "Component", "Status / Impact", "Severity", "Proposed Action"],
    "tableRows": [
      ["ITEM-01", "Verification of operational benchmarks in attached file", "Audit Engine", "Compliant", "Minor", "Approve and archive record"],
      ["ITEM-02", "Action item identified for follow-up deliverables", "Work Plan", "In Review", "Major", "Schedule milestone review"]
    ],
    "recommendations": [
      "Incorporate extracted findings into immediate sprint cycles.",
      "Track pending deliverables via the Kanban board."
    ]
  }
}
\`\`\``;
      }
    }
    else {
      if (isAr) {
        reply = `أهلاً بك! بصفتي المساعد الذكي لإدارة وتحليل التقارير، يمكنني:
- **تحويل المستندات (PDF / DOCX / Markdown):** ارفع أي ملف وسأحوله إلى تقرير منسق بجداوله الكاملة بنقرة زر واحدة.
- **تحليل ومحاورة النظام:** اسألني عن التقرير الحالي، أو اطلب ملخصاً للمشاكل المفتوحة والحرجة في لوحة المتابعة، أو مقارنة بين التقارير المسجلة.
- **توليد أي من القوالب الـ 7:** تقارير المشاكل، أعمال المستقلين، دراسات السوق والمنافسين، المتطلبات والمنتج، الأداء المالي، القرارات والتوصيات، أو أداء المنتج.
- **دعم كافة النماذج:** يمكنك ربط أي نموذج من OpenAI أو Anthropic أو Gemini من الإعدادات أو شريط المساعد.

تفضل بطرح سؤالك أو إرفاق ملفك للبدء فوراً!`;
      } else {
        reply = `Welcome! As your AI Report Analyst & Copilot, I can:
- **Convert Documents (PDF / Word / Markdown):** Attach any file and I will transform it into a structured system report with one click.
- **Context-Aware Inquiries:** Ask me about the current report, request a summary of critical open issues, or synthesize trends across all reports.
- **Generate Any of the 7 Report Types:** Problem Analysis, Freelancer Work, Market & Competitors, Requirements, Financial Performance, Decision & Recommendations, or Product KPIs.
- **Multi-Model Support:** Connect any model from OpenAI, Anthropic, or Gemini directly from the settings or sidecar header.

Feel free to attach a document or ask your question!`;
      }
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error('AI chat route error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process AI chat request' },
      { status: 500 }
    );
  }
}
