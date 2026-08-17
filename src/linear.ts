const LINEAR_API_URL = "https://api.linear.app/graphql";

export function getApiKey(): string {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    throw new Error("LINEAR_API_KEY environment variable is required");
  }
  return key;
}

export async function linearRequest<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getApiKey(),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Linear API error (${response.status}): ${text}`);
  }

  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors?.length) {
    throw new Error(`Linear GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`);
  }

  return json.data as T;
}

// --- GraphQL Queries ---

export const VIEWER_QUERY = `
  query Viewer {
    viewer {
      id
      name
      email
      displayName
      active
    }
  }
`;

export const TEAMS_QUERY = `
  query Teams {
    teams {
      nodes {
        id
        name
        key
        description
      }
    }
  }
`;

export const WORKFLOW_STATES_QUERY = `
  query WorkflowStates($teamId: String!) {
    team(id: $teamId) {
      states {
        nodes {
          id
          name
          type
          color
          position
        }
      }
    }
  }
`;

export const ISSUES_QUERY = `
  query Issues($filter: IssueFilter, $first: Int) {
    issues(filter: $filter, first: $first, orderBy: updatedAt) {
      nodes {
        id
        identifier
        title
        priority
        priorityLabel
        state {
          id
          name
          type
        }
        assignee {
          id
          name
        }
        team {
          id
          name
          key
        }
        labels {
          nodes {
            id
            name
          }
        }
        dueDate
        estimate
        url
        createdAt
        updatedAt
      }
    }
  }
`;

export const ISSUE_DETAIL_QUERY = `
  query Issue($id: String!) {
    issue(id: $id) {
      id
      identifier
      title
      description
      priority
      priorityLabel
      state {
        id
        name
        type
      }
      assignee {
        id
        name
      }
      team {
        id
        name
        key
      }
      labels {
        nodes {
          id
          name
        }
      }
      parent {
        id
        identifier
        title
      }
      children {
        nodes {
          id
          identifier
          title
          state {
            name
          }
        }
      }
      comments {
        nodes {
          id
          body
          user {
            name
          }
          createdAt
        }
      }
      attachments {
        nodes {
          id
          title
          url
          metadata
          sourceType
        }
      }
      dueDate
      estimate
      url
      createdAt
      updatedAt
    }
  }
`;

export const SEARCH_ISSUES_QUERY = `
  query SearchIssues($query: String!, $first: Int) {
    searchIssues(query: $query, first: $first) {
      nodes {
        id
        identifier
        title
        priority
        priorityLabel
        state {
          id
          name
          type
        }
        assignee {
          id
          name
        }
        team {
          id
          name
          key
        }
        url
        updatedAt
      }
    }
  }
`;

export const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        title
        url
        state {
          name
        }
      }
    }
  }
`;

export const UPDATE_ISSUE_MUTATION = `
  mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        id
        identifier
        title
        url
        state {
          name
        }
        priority
        priorityLabel
        assignee {
          name
        }
      }
    }
  }
`;

export const ADD_COMMENT_MUTATION = `
  mutation AddComment($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) {
      success
      comment {
        id
        body
        createdAt
      }
    }
  }
`;

// --- Image Helpers ---

const IMAGE_URL_REGEX = /!\[[^\]]*\]\(([^)]+)\)/g;
const SUPPORTED_IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function extractImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  let match;
  while ((match = IMAGE_URL_REGEX.exec(markdown)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

function getMimeType(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (const [ext, mime] of Object.entries(SUPPORTED_IMAGE_TYPES)) {
      if (pathname.endsWith(ext)) return mime;
    }
    // Linear CDN uploads often don't have extensions — assume png
    if (pathname.includes("/uploads/")) return "image/png";
    return null;
  } catch {
    return null;
  }
}

export async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const headers: Record<string, string> = {};
    // Linear CDN uploads require API key authentication
    if (url.includes("uploads.linear.app")) {
      headers["Authorization"] = getApiKey();
    }
    const response = await fetch(url, { redirect: "follow", headers });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    const mimeType = contentType.startsWith("image/")
      ? contentType.split(";")[0]
      : getMimeType(url);

    if (!mimeType) return null;

    const buffer = await response.arrayBuffer();
    const data = Buffer.from(buffer).toString("base64");
    return { data, mimeType };
  } catch {
    return null;
  }
}

export async function fetchAllImages(
  urls: string[]
): Promise<Array<{ data: string; mimeType: string }>> {
  const results = await Promise.all(urls.map(fetchImageAsBase64));
  return results.filter((r): r is { data: string; mimeType: string } => r !== null);
}

// --- Types ---

export interface LinearUser {
  id: string;
  name: string;
  email: string;
  displayName: string;
  active: boolean;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
}

export interface WorkflowState {
  id: string;
  name: string;
  type: string;
  color: string;
  position: number;
}

export interface LinearLabel {
  id: string;
  name: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  priorityLabel: string;
  state: { id: string; name: string; type: string };
  assignee?: { id: string; name: string };
  team: { id: string; name: string; key: string };
  labels: { nodes: LinearLabel[] };
  parent?: { id: string; identifier: string; title: string };
  children?: { nodes: Array<{ id: string; identifier: string; title: string; state: { name: string } }> };
  comments?: { nodes: Array<{ id: string; body: string; user: { name: string }; createdAt: string }> };
  attachments?: { nodes: Array<{ id: string; title: string; url: string; metadata: unknown; sourceType: string }> };
  dueDate?: string;
  estimate?: number;
  url: string;
  createdAt: string;
  updatedAt: string;
}
