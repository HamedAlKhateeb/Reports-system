'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Key,
  Folder,
  Check,
  Copy,
  Code2,
  BookOpen,
  Send,
  Sliders,
  ShieldCheck,
  Power,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function ApiGuidePage() {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const handleCopy = (code: string, id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code);
    }
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const curlGetIssues = `curl -X GET "https://reports-system.myreports-367.workers.dev/api/v1/issues?status=open" \\
  -H "X-API-Key: rk_live_your_actual_key"`;

  const curlPatchIssue = `curl -X PATCH "https://reports-system.myreports-367.workers.dev/api/v1/issues/ISSUE_ID" \\
  -H "X-API-Key: rk_live_your_actual_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "status": "completed"
  }'`;

  const curlCreateReport = `curl -X POST "https://reports-system.myreports-367.workers.dev/api/v1/reports" \\
  -H "X-API-Key: rk_live_your_actual_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Translation Quality & Performance Audit",
    "markdown": "## Executive Summary\\nAll technical strings and locale dictionaries were inspected.\\n\\n### Key Findings\\n- Terminology consistency verified\\n- Resolved 14 localized formatting issues\\n- Performance score improved by 35%",
    "language": "en"
  }'`;

  const pythonScript = `import os
import requests
from openai import OpenAI

# 1. Base Configuration & Headers
BASE_URL = "https://reports-system.myreports-367.workers.dev"
API_KEY = "rk_live_your_actual_key"

HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Helper: Fetch pending open issues
def get_open_issues():
    res = requests.get(f"{BASE_URL}/api/v1/issues?status=open", headers=HEADERS)
    res.raise_for_status()
    return res.json().get("issues", [])

# Helper: Update issue status ('open' | 'in_progress' | 'completed')
def update_issue_status(issue_id: str, status: str):
    res = requests.patch(
        f"{BASE_URL}/api/v1/issues/{issue_id}",
        json={"status": status},
        headers=HEADERS
    )
    res.raise_for_status()
    return res.json()

# Helper: Publish review report
def create_report(title: str, markdown: str, language: str = "en", folder_id: str = None):
    payload = {
        "title": title,
        "markdown": markdown,
        "language": language
    }
    # If folder_id is omitted, report is automatically placed in 'AI Agent Reports' folder
    if folder_id:
        payload["folderId"] = folder_id

    res = requests.post(f"{BASE_URL}/api/v1/reports", json=payload, headers=HEADERS)
    res.raise_for_status()
    return res.json()

# --- Autonomous Agent Execution Loop ---
if __name__ == "__main__":
    client = OpenAI()

    # Step 1: Query open issues awaiting review
    issues = get_open_issues()
    print(f"Discovered {len(issues)} open issues.")

    if issues:
        target = issues[0]
        print(f"Processing Issue: {target['title']} (ID: {target['id']})")

        # Step 2: Mark issue as 'in_progress'
        update_issue_status(target['id'], "in_progress")

        # Step 3: Run LLM prompt for technical review
        prompt = f"""You are an autonomous quality assurance agent.
Review the following reported issue and generate a structured audit report in Markdown format.

Issue Title: {target['title']}
Description: {target.get('description', 'No details provided.')}
Severity: {target.get('severity', 'medium')}
"""
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        report_markdown = response.choices[0].message.content

        # Step 4: Publish review report back to the system
        created = create_report(
            title=f"Audit Report: {target['title']}",
            markdown=report_markdown,
            language="en"
        )
        print(f"Report successfully saved with ID: #{created['report']['reportNumber']}")

        # Step 5: Mark issue as 'completed'
        update_issue_status(target['id'], "completed")
        print("Issue resolution cycle completed successfully!")
`;

  const nodeScript = `import fetch from 'node-fetch';

const BASE_URL = 'https://reports-system.myreports-367.workers.dev';
const API_KEY = 'rk_live_your_actual_key';

const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json'
};

// 1. Fetch open issues
async function getOpenIssues() {
  const res = await fetch(\`\${BASE_URL}/api/v1/issues?status=open\`, { headers });
  if (!res.ok) throw new Error(\`Failed to fetch issues: \${res.statusText}\`);
  return await res.json();
}

// 2. Update issue status ('open' | 'in_progress' | 'completed')
async function updateIssue(id, status) {
  const res = await fetch(\`\${BASE_URL}/api/v1/issues/\${id}\`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status })
  });
  if (!res.ok) throw new Error(\`Failed to update issue: \${res.statusText}\`);
  return await res.json();
}

// 3. Create review report
async function createReport(title, markdown, language = 'en') {
  const res = await fetch(\`\${BASE_URL}/api/v1/reports\`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, markdown, language })
  });
  if (!res.ok) throw new Error(\`Failed to create report: \${res.statusText}\`);
  return await res.json();
}
`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-8 text-left" dir="ltr">
      {/* Header Banner */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
              <Bot className="h-3.5 w-3.5" />
              <span>AI Agents &amp; Autonomous LLM Integration</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              External Agent API Integration Guide
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              Connect external AI models and autonomous agents (OpenAI GPT-4o, Claude, Cursor, LangChain, or custom scripts) to query issues, update workflow statuses, and publish formatted reports automatically.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl text-xs font-semibold">
              <a href="/api/docs" target="_blank" rel="noopener noreferrer">
                <BookOpen className="h-4 w-4 text-primary" />
                <span>Interactive Docs</span>
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl text-xs font-semibold">
              <a href="/api/openapi.json" target="_blank" rel="noopener noreferrer">
                <Code2 className="h-4 w-4 text-blue-600" />
                <span>OpenAPI Spec</span>
              </a>
            </Button>
            <Button asChild size="sm" className="h-9 gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold">
              <Link href="/settings#api-keys">
                <Key className="h-4 w-4" />
                <span>Get API Key</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Key Concepts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1 */}
        <Card className="border-border/70 bg-card">
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Key className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Step 1
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-1 space-y-1.5">
            <h3 className="text-sm font-bold text-foreground">
              Generate Secret Key
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Navigate to <strong>Settings &gt; Agent API Keys</strong>, click &quot;Generate Key&quot;, and store the secret token starting with <code className="font-mono text-foreground font-semibold">rk_live_...</code>. API access requires a registered account.
            </p>
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card className="border-border/70 bg-card">
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
                <Send className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Step 2
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-1 space-y-1.5">
            <h3 className="text-sm font-bold text-foreground">
              Authenticate Requests
            </h3>
            <p className="text-xs text-muted-foreground font-mono bg-muted/60 p-1.5 rounded-md text-[11px]">
              X-API-Key: rk_live_...
            </p>
            <p className="text-xs text-muted-foreground">
              Pass this header in every HTTP request. Standard Bearer Authorization is also supported.
            </p>
          </CardContent>
        </Card>

        {/* Step 3 */}
        <Card className="border-border/70 bg-card">
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                <Folder className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Step 3
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-1 space-y-1.5">
            <h3 className="text-sm font-bold text-foreground">
              Smart Auto-Routing
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When an agent publishes a report without specifying a <code className="font-mono text-foreground font-semibold">folderId</code>, it is automatically routed to the dedicated <strong>&quot;AI Agent Reports&quot;</strong> folder.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Security & Kill Switch Overview Card */}
      <Card className="border-border/80 bg-card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="size-5" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="text-base font-bold text-foreground">
                Security, Account Eligibility &amp; Emergency Kill-Switch
              </h2>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                The Reports System implements multi-layered protections to safeguard your data and infrastructure:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Power className="size-3.5 text-primary" />
                  <span>Master Kill-Switch</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Account owners can pause all incoming external API calls with a single toggle in Settings. Rejected requests receive HTTP <code className="font-mono text-foreground font-semibold">503 Service Unavailable</code>.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Key className="size-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Per-Key Pause / Revoke</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Keys can be temporarily paused or permanently revoked individually. Paused keys return HTTP <code className="font-mono text-foreground font-semibold">403 Forbidden (API_KEY_PAUSED)</code>.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Layers className="size-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Guest Restriction</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Unregistered guest users cannot generate or own API keys. You must register or log in with an authenticated account to obtain keys.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Allowed Status Table */}
      <Card className="border-border/80 bg-card">
        <CardHeader className="p-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold text-foreground">
              Allowed Issue Status Values
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            When updating issues via <code className="font-mono text-foreground font-semibold">PATCH /api/v1/issues/:id</code>, use one of these exact values:
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">API Value</th>
                  <th className="py-2.5 px-4 font-semibold">UI Board Status</th>
                  <th className="py-2.5 px-4 font-semibold">Workflow Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <tr>
                  <td className="py-3 px-4 font-mono font-bold text-foreground">&quot;open&quot;</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-300 bg-amber-50 dark:bg-amber-950/50">
                      Open
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Issue is logged and awaiting investigation by an agent or human reviewer.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono font-bold text-foreground">&quot;in_progress&quot;</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className="text-blue-700 dark:text-blue-300 border-blue-300 bg-blue-50 dark:bg-blue-950/50">
                      In Progress
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Autonomous agent or reviewer has picked up the issue and is actively diagnosing or resolving it.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-mono font-bold text-foreground">&quot;completed&quot; or &quot;done&quot;</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/50">
                      Done / Completed
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    Issue resolution is verified and the comprehensive review report has been filed.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Code Examples Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">
            Production-Ready Code Examples
          </h2>
        </div>

        <Tabs defaultValue="python" className="w-full">
          <TabsList className="h-10 p-0.5 bg-muted/60 rounded-xl">
            <TabsTrigger value="python" className="text-xs font-semibold px-4 rounded-lg">
              Python (Autonomous Agent)
            </TabsTrigger>
            <TabsTrigger value="curl" className="text-xs font-semibold px-4 rounded-lg">
              cURL (Terminal)
            </TabsTrigger>
            <TabsTrigger value="node" className="text-xs font-semibold px-4 rounded-lg">
              Node.js / TypeScript
            </TabsTrigger>
            <TabsTrigger value="customgpt" className="text-xs font-semibold px-4 rounded-lg">
              OpenAI Custom GPT
            </TabsTrigger>
          </TabsList>

          {/* Python Tab */}
          <TabsContent value="python" className="mt-4">
            <Card className="border-border/80 bg-[#1E1E1E] text-slate-100 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#252526] border-b border-border/20 text-xs">
                <span className="text-slate-400 font-mono">agent_example.py</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(pythonScript, 'python')}
                  className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-700/50"
                >
                  {copiedSnippet === 'python' ? (
                    <>
                      <Check className="h-3.5 w-3.5 me-1 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 me-1" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
              <pre className="p-4 text-xs font-mono overflow-x-auto leading-relaxed text-slate-200">
                <code>{pythonScript}</code>
              </pre>
            </Card>
          </TabsContent>

          {/* cURL Tab */}
          <TabsContent value="curl" className="mt-4 space-y-4">
            {/* cURL 1 */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-foreground">1. Query Open Issues</span>
              <div className="relative rounded-xl bg-[#1E1E1E] p-3 text-xs font-mono text-slate-100 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => handleCopy(curlGetIssues, 'curl1')}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  aria-label="Copy cURL command 1"
                >
                  {copiedSnippet === 'curl1' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <pre><code>{curlGetIssues}</code></pre>
              </div>
            </div>

            {/* cURL 2 */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-foreground">2. Update Issue Status to Completed</span>
              <div className="relative rounded-xl bg-[#1E1E1E] p-3 text-xs font-mono text-slate-100 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => handleCopy(curlPatchIssue, 'curl2')}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  aria-label="Copy cURL command 2"
                >
                  {copiedSnippet === 'curl2' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <pre><code>{curlPatchIssue}</code></pre>
              </div>
            </div>

            {/* cURL 3 */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-foreground">3. Publish Audit Report (Auto Routed to AI Folder)</span>
              <div className="relative rounded-xl bg-[#1E1E1E] p-3 text-xs font-mono text-slate-100 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => handleCopy(curlCreateReport, 'curl3')}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  aria-label="Copy cURL command 3"
                >
                  {copiedSnippet === 'curl3' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <pre><code>{curlCreateReport}</code></pre>
              </div>
            </div>
          </TabsContent>

          {/* Node.js Tab */}
          <TabsContent value="node" className="mt-4">
            <Card className="border-border/80 bg-[#1E1E1E] text-slate-100 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#252526] border-b border-border/20 text-xs">
                <span className="text-slate-400 font-mono">agent.mjs</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(nodeScript, 'node')}
                  className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-700/50"
                >
                  {copiedSnippet === 'node' ? (
                    <>
                      <Check className="h-3.5 w-3.5 me-1 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 me-1" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
              <pre className="p-4 text-xs font-mono overflow-x-auto leading-relaxed text-slate-200">
                <code>{nodeScript}</code>
              </pre>
            </Card>
          </TabsContent>

          {/* Custom GPT Tab */}
          <TabsContent value="customgpt" className="mt-4">
            <Card className="border-border/80 bg-card p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground">
                  Connect Directly to OpenAI Custom GPT (No Code Required):
                </h3>
                <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-2 leading-relaxed">
                  <li>
                    In the OpenAI GPT Builder, navigate to <strong className="text-foreground">Configure &gt; Actions &gt; Create new action</strong>.
                  </li>
                  <li>
                    Click <strong className="text-foreground">Import from URL</strong> and enter the live OpenAPI URL:
                    <div className="mt-1 p-2 rounded-lg bg-muted/60 font-mono text-[11px] text-foreground select-all">
                      https://reports-system.myreports-367.workers.dev/api/openapi.json
                    </div>
                  </li>
                  <li>
                    Under <strong className="text-foreground">Authentication</strong> settings:
                    <ul className="list-disc list-inside ps-4 mt-1 space-y-1">
                      <li>Auth Type: <span className="font-mono font-bold text-foreground">API Key</span></li>
                      <li>Auth Type Sub-option: <span className="font-mono font-bold text-foreground">Custom</span></li>
                      <li>Custom Header Name: <span className="font-mono font-bold text-foreground">X-API-Key</span></li>
                      <li>API Key: <span className="text-muted-foreground">Paste the secret key generated from Settings</span></li>
                    </ul>
                  </li>
                  <li>
                    Save changes. Your Custom GPT can now autonomously read pending issues, file reports, and update tickets automatically!
                  </li>
                </ol>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
