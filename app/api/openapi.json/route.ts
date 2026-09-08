import { NextResponse } from 'next/server';

export async function GET() {
  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'Review Reports & Issue Tracker API for AI Agents',
      version: '1.0.0',
      description:
        'REST API for external AI agents to read, create, and update software review reports and track issues.',
    },
    servers: [
      {
        url: '/',
        description: 'Current Environment API Server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key generated in Settings > API',
        },
      },
      schemas: {
        Issue: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'iss_1725700000_abcde' },
            title: { type: 'string', example: 'Memory leak during image processing' },
            description: { type: 'string', example: 'Detailed error description' },
            status: {
              type: 'string',
              enum: ['open', 'in_progress', 'done', 'completed'],
              description:
                'Exact status mapping: "open" -> مفتوحة (Open), "in_progress" -> قيد التنفيذ (In Progress), "done" or "completed" -> مكتملة (Done / Completed)',
              example: 'open',
            },
            severity: {
              type: 'string',
              enum: ['critical', 'major', 'medium', 'normal', 'minor'],
              example: 'major',
            },
            linkedReportId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'title', 'status', 'severity'],
        },
        Report: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'rep_1725700000_xyz12' },
            reportNumber: { type: 'integer', example: 12 },
            title: { type: 'string', example: 'Sprint 34 Technical Quality & Performance Audit' },
            author: { type: 'string', example: 'AI Review Copilot' },
            systemUnderReview: { type: 'string', example: 'Authentication & Payment Microservice' },
            language: { type: 'string', enum: ['ar', 'en'], example: 'ar' },
            folderId: {
              type: 'string',
              nullable: true,
              description:
                'Folder ID to place this report in. If omitted in POST /api/v1/reports, automatically stored in "تقارير الوكيل الذكي" (AI Agent Reports).',
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'reportNumber', 'title', 'systemUnderReview'],
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Field "title" is required.' },
              },
            },
          },
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
      '/api/v1/issues': {
        get: {
          summary: 'List Issues',
          description: 'Retrieve all issues with optional filtering by status or severity.',
          parameters: [
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['open', 'in_progress', 'done', 'completed'] },
              description: 'Filter by issue status.',
            },
            {
              name: 'severity',
              in: 'query',
              schema: { type: 'string', enum: ['critical', 'major', 'medium', 'normal', 'minor'] },
              description: 'Filter by severity.',
            },
          ],
          responses: {
            '200': { description: 'List of issues' },
            '401': { description: 'Unauthorized' },
          },
        },
        post: {
          summary: 'Create Issue',
          description: 'Create a new issue on the dashboard.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', example: 'API gateway timeout under peak load' },
                    description: { type: 'string', example: 'Occurred during 100 concurrent requests' },
                    severity: {
                      type: 'string',
                      enum: ['critical', 'major', 'medium', 'normal', 'minor'],
                      default: 'medium',
                    },
                    status: {
                      type: 'string',
                      enum: ['open', 'in_progress', 'done', 'completed'],
                      default: 'open',
                      description:
                        'Matches board columns: "open" -> مفتوحة, "in_progress" -> قيد التنفيذ, "done" -> مكتملة',
                    },
                    linkedReportId: { type: 'string', nullable: true },
                  },
                  required: ['title'],
                },
              },
            },
          },
          responses: {
            '201': { description: 'Issue created successfully' },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/v1/issues/{id}': {
        get: {
          summary: 'Get Issue Details',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Issue details with comments' },
            '404': { description: 'Not found' },
          },
        },
        patch: {
          summary: 'Update Issue',
          description:
            'Update issue status, severity, or notes. Valid statuses: "open" (مفتوحة), "in_progress" (قيد التنفيذ), "done" or "completed" (مكتملة).',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    status: {
                      type: 'string',
                      enum: ['open', 'in_progress', 'done', 'completed'],
                      description: 'Exact mapping to board: open=مفتوحة, in_progress=قيد التنفيذ, done=مكتملة',
                    },
                    severity: {
                      type: 'string',
                      enum: ['critical', 'major', 'medium', 'normal', 'minor'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Issue updated' },
            '400': { description: 'Validation error' },
            '404': { description: 'Issue not found' },
          },
        },
      },
      '/api/v1/reports': {
        get: {
          summary: 'List Reports',
          parameters: [
            {
              name: 'folderId',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Filter reports by folder ID or "root" for uncategorized',
            },
          ],
          responses: {
            '200': { description: 'List of reports' },
            '401': { description: 'Unauthorized' },
          },
        },
        post: {
          summary: 'Create Report',
          description:
            'Create a new report. If folderId is not specified, the report is automatically placed in "تقارير الوكيل الذكي" (AI Agent Reports). Content can be plain text, markdown, or TipTap JSON.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', example: 'Audit Report: Microservices Performance' },
                    content: {
                      type: 'string',
                      example: '# Executive Summary\n\nAll critical issues have been resolved.\n\n## Recommendations\n- Upgrade Redis cluster\n- Enable auto-scaling',
                      description: 'Plain markdown string or text',
                    },
                    language: { type: 'string', enum: ['ar', 'en'], default: 'ar' },
                    author: { type: 'string', example: 'Automated Audit Agent' },
                    authorTitle: { type: 'string', example: 'Lead AI Reviewer' },
                    organization: { type: 'string', example: 'Quality Assurance Dept' },
                    systemUnderReview: { type: 'string', example: 'Order Processing API' },
                    folderId: {
                      type: 'string',
                      description:
                        'Optional target folder ID. If omitted, automatically defaults to "تقارير الوكيل الذكي".',
                    },
                    themeColor: { type: 'string', enum: ['olive', 'blue', 'slate', 'emerald'], default: 'olive' },
                    backgroundColor: { type: 'string', enum: ['white', 'cream', 'cool'], default: 'white' },
                  },
                  required: ['title'],
                },
              },
            },
          },
          responses: {
            '201': { description: 'Report created successfully' },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/v1/reports/{id}': {
        get: {
          summary: 'Get Full Report',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Full report content with images and metadata' },
            '404': { description: 'Not found' },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiSpec, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  });
}
