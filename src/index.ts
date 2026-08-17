#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  linearRequest,
  getApiKey,
  extractImageUrls,
  fetchAllImages,
  VIEWER_QUERY,
  TEAMS_QUERY,
  WORKFLOW_STATES_QUERY,
  ISSUES_QUERY,
  ISSUE_DETAIL_QUERY,
  SEARCH_ISSUES_QUERY,
  CREATE_ISSUE_MUTATION,
  UPDATE_ISSUE_MUTATION,
  ADD_COMMENT_MUTATION,
  type LinearUser,
  type LinearTeam,
  type WorkflowState,
  type LinearIssue,
} from "./linear.js";

const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

function formatIssueCompact(issue: LinearIssue): string {
  const assignee = issue.assignee?.name ?? "Unassigned";
  const labels = issue.labels.nodes.map((l) => l.name).join(", ") || "None";
  return [
    `${issue.identifier}: ${issue.title}`,
    `  Status: ${issue.state.name} | Priority: ${issue.priorityLabel} | Assignee: ${assignee}`,
    `  Labels: ${labels} | Team: ${issue.team.name}`,
    `  URL: ${issue.url}`,
  ].join("\n");
}

function formatIssueFull(issue: LinearIssue): string {
  const lines = [
    `# ${issue.identifier}: ${issue.title}`,
    "",
    `**Status:** ${issue.state.name} (${issue.state.type})`,
    `**Priority:** ${issue.priorityLabel}`,
    `**Assignee:** ${issue.assignee?.name ?? "Unassigned"}`,
    `**Team:** ${issue.team.name} (${issue.team.key})`,
    `**Labels:** ${issue.labels.nodes.map((l) => l.name).join(", ") || "None"}`,
    `**Due Date:** ${issue.dueDate ?? "None"}`,
    `**Estimate:** ${issue.estimate ?? "None"}`,
    `**URL:** ${issue.url}`,
    `**Created:** ${issue.createdAt}`,
    `**Updated:** ${issue.updatedAt}`,
  ];

  if (issue.parent) {
    lines.push(`**Parent:** ${issue.parent.identifier}: ${issue.parent.title}`);
  }

  if (issue.description) {
    lines.push("", "## Description", "", issue.description);
  }

  if (issue.children?.nodes.length) {
    lines.push("", "## Sub-issues");
    for (const child of issue.children.nodes) {
      lines.push(`- ${child.identifier}: ${child.title} [${child.state.name}]`);
    }
  }

  if (issue.comments?.nodes.length) {
    lines.push("", "## Comments");
    for (const comment of issue.comments.nodes) {
      lines.push(``, `**${comment.user.name}** (${comment.createdAt}):`);
      lines.push(comment.body);
    }
  }

  return lines.join("\n");
}

// --- Server Setup ---

const server = new McpServer({
  name: "linear",
  version: "1.0.0",
});

// --- Tools ---

server.tool(
  "linear_get_user",
  "Get the authenticated Linear user's profile information",
  {},
  async () => {
    const data = await linearRequest<{ viewer: LinearUser }>(VIEWER_QUERY);
    const u = data.viewer;
    return {
      content: [
        {
          type: "text",
          text: [
            `Name: ${u.displayName} (${u.name})`,
            `Email: ${u.email}`,
            `ID: ${u.id}`,
            `Active: ${u.active}`,
          ].join("\n"),
        },
      ],
    };
  }
);

server.tool(
  "linear_list_teams",
  "List all teams in the Linear workspace",
  {},
  async () => {
    const data = await linearRequest<{ teams: { nodes: LinearTeam[] } }>(TEAMS_QUERY);
    const teams = data.teams.nodes;
    if (!teams.length) {
      return { content: [{ type: "text" as const, text: "No teams found." }] };
    }
    const text = teams
      .map((t) => `${t.name} (${t.key}) — ID: ${t.id}${t.description ? `\n  ${t.description}` : ""}`)
      .join("\n");
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "linear_list_workflow_states",
  "List workflow states (statuses) for a team. Use this to find stateId values for updating issues.",
  {
    teamId: z.string().describe("The team ID (UUID). Use linear_list_teams to find it."),
  },
  async ({ teamId }) => {
    const data = await linearRequest<{ team: { states: { nodes: WorkflowState[] } } }>(
      WORKFLOW_STATES_QUERY,
      { teamId }
    );
    const states = data.team.states.nodes.sort((a, b) => a.position - b.position);
    const text = states
      .map((s) => `${s.name} — type: ${s.type}, id: ${s.id}, color: ${s.color}`)
      .join("\n");
    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "linear_list_issues",
  "List issues from Linear, optionally filtered by team, status type, or assignment",
  {
    teamId: z.string().optional().describe("Filter by team ID (UUID)"),
    statusType: z
      .enum(["triage", "backlog", "unstarted", "started", "completed", "canceled"])
      .optional()
      .describe("Filter by workflow state type"),
    assignedToMe: z
      .boolean()
      .optional()
      .describe("If true, only show issues assigned to the authenticated user"),
    limit: z.number().min(1).max(100).optional().describe("Max results (default 50)"),
  },
  async ({ teamId, statusType, assignedToMe, limit }) => {
    const filter: Record<string, unknown> = {};

    if (teamId) {
      filter.team = { id: { eq: teamId } };
    }
    if (statusType) {
      filter.state = { type: { eq: statusType } };
    }
    if (assignedToMe) {
      filter.assignee = { isMe: { eq: true } };
    }

    const data = await linearRequest<{ issues: { nodes: LinearIssue[] } }>(ISSUES_QUERY, {
      filter: Object.keys(filter).length ? filter : undefined,
      first: limit ?? 50,
    });

    const issues = data.issues.nodes;
    if (!issues.length) {
      return { content: [{ type: "text" as const, text: "No issues found matching filters." }] };
    }

    const text = issues.map(formatIssueCompact).join("\n\n");
    return {
      content: [{ type: "text" as const, text: `Found ${issues.length} issue(s):\n\n${text}` }],
    };
  }
);

server.tool(
  "linear_get_issue",
  "Get full details of a single Linear issue including description, comments, and sub-issues",
  {
    issueId: z
      .string()
      .describe('Issue identifier (e.g. "ENG-123") or UUID'),
  },
  async ({ issueId }) => {
    const data = await linearRequest<{ issue: LinearIssue }>(ISSUE_DETAIL_QUERY, {
      id: issueId,
    });

    const issue = data.issue;
    const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];

    // Add text content
    content.push({ type: "text" as const, text: formatIssueFull(issue) });

    // Collect all image URLs from description, comments, and attachments
    const imageUrls: string[] = [];

    if (issue.description) {
      imageUrls.push(...extractImageUrls(issue.description));
    }

    if (issue.comments?.nodes) {
      for (const comment of issue.comments.nodes) {
        imageUrls.push(...extractImageUrls(comment.body));
      }
    }

    if (issue.attachments?.nodes) {
      for (const att of issue.attachments.nodes) {
        if (att.url) imageUrls.push(att.url);
      }
    }

    // Fetch and attach images
    if (imageUrls.length > 0) {
      const images = await fetchAllImages(imageUrls);
      for (const img of images) {
        content.push({ type: "image" as const, data: img.data, mimeType: img.mimeType });
      }
      if (images.length > 0) {
        content.push({ type: "text" as const, text: `\n[${images.length} image(s) attached above]` });
      }
    }

    return { content };
  }
);

server.tool(
  "linear_search_issues",
  "Search Linear issues by text query",
  {
    query: z.string().describe("Search query text"),
    limit: z.number().min(1).max(100).optional().describe("Max results (default 20)"),
  },
  async ({ query, limit }) => {
    const data = await linearRequest<{ searchIssues: { nodes: LinearIssue[] } }>(
      SEARCH_ISSUES_QUERY,
      { query, first: limit ?? 20 }
    );

    const issues = data.searchIssues.nodes;
    if (!issues.length) {
      return { content: [{ type: "text" as const, text: `No issues found for "${query}".` }] };
    }

    const text = issues.map(formatIssueCompact).join("\n\n");
    return {
      content: [{ type: "text" as const, text: `Found ${issues.length} result(s):\n\n${text}` }],
    };
  }
);

server.tool(
  "linear_create_issue",
  "Create a new issue in Linear",
  {
    title: z.string().describe("Issue title"),
    teamId: z.string().describe("Team ID (UUID). Use linear_list_teams to find it."),
    description: z.string().optional().describe("Issue description (markdown supported)"),
    priority: z
      .number()
      .min(0)
      .max(4)
      .optional()
      .describe("Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low"),
    stateId: z
      .string()
      .optional()
      .describe("Workflow state ID. Use linear_list_workflow_states to find it."),
    assigneeId: z.string().optional().describe("Assignee user ID (UUID)"),
  },
  async ({ title, teamId, description, priority, stateId, assigneeId }) => {
    const input: Record<string, unknown> = { title, teamId };
    if (description !== undefined) input.description = description;
    if (priority !== undefined) input.priority = priority;
    if (stateId !== undefined) input.stateId = stateId;
    if (assigneeId !== undefined) input.assigneeId = assigneeId;

    const data = await linearRequest<{
      issueCreate: {
        success: boolean;
        issue: { id: string; identifier: string; title: string; url: string; state: { name: string } };
      };
    }>(CREATE_ISSUE_MUTATION, { input });

    if (!data.issueCreate.success) {
      return { content: [{ type: "text" as const, text: "Failed to create issue." }] };
    }

    const issue = data.issueCreate.issue;
    return {
      content: [
        {
          type: "text" as const,
          text: `Created issue ${issue.identifier}: ${issue.title}\nStatus: ${issue.state.name}\nURL: ${issue.url}`,
        },
      ],
    };
  }
);

server.tool(
  "linear_update_issue",
  "Update an existing Linear issue (status, priority, assignee, title, description)",
  {
    issueId: z
      .string()
      .describe('Issue identifier (e.g. "ENG-123") or UUID'),
    stateId: z
      .string()
      .optional()
      .describe("New workflow state ID. Use linear_list_workflow_states to find valid IDs."),
    priority: z
      .number()
      .min(0)
      .max(4)
      .optional()
      .describe("New priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low"),
    assigneeId: z.string().optional().describe("New assignee user ID (UUID)"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description (markdown supported)"),
  },
  async ({ issueId, stateId, priority, assigneeId, title, description }) => {
    const input: Record<string, unknown> = {};
    if (stateId !== undefined) input.stateId = stateId;
    if (priority !== undefined) input.priority = priority;
    if (assigneeId !== undefined) input.assigneeId = assigneeId;
    if (title !== undefined) input.title = title;
    if (description !== undefined) input.description = description;

    if (!Object.keys(input).length) {
      return { content: [{ type: "text" as const, text: "No fields to update. Provide at least one field." }] };
    }

    const data = await linearRequest<{
      issueUpdate: {
        success: boolean;
        issue: {
          id: string;
          identifier: string;
          title: string;
          url: string;
          state: { name: string };
          priority: number;
          priorityLabel: string;
          assignee?: { name: string };
        };
      };
    }>(UPDATE_ISSUE_MUTATION, { id: issueId, input });

    if (!data.issueUpdate.success) {
      return { content: [{ type: "text" as const, text: "Failed to update issue." }] };
    }

    const issue = data.issueUpdate.issue;
    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Updated ${issue.identifier}: ${issue.title}`,
            `Status: ${issue.state.name}`,
            `Priority: ${issue.priorityLabel}`,
            `Assignee: ${issue.assignee?.name ?? "Unassigned"}`,
            `URL: ${issue.url}`,
          ].join("\n"),
        },
      ],
    };
  }
);

server.tool(
  "linear_add_comment",
  "Add a comment to a Linear issue",
  {
    issueId: z
      .string()
      .describe('Issue identifier (e.g. "ENG-123") or UUID'),
    body: z.string().describe("Comment body (markdown supported)"),
  },
  async ({ issueId, body }) => {
    const data = await linearRequest<{
      commentCreate: {
        success: boolean;
        comment: { id: string; body: string; createdAt: string };
      };
    }>(ADD_COMMENT_MUTATION, { issueId, body });

    if (!data.commentCreate.success) {
      return { content: [{ type: "text" as const, text: "Failed to add comment." }] };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Comment added successfully at ${data.commentCreate.comment.createdAt}`,
        },
      ],
    };
  }
);

// --- Start Server ---

async function main() {
  // Validate API key is set before starting
  getApiKey();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Linear MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
