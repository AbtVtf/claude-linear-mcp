# Linear API: Comprehensive Research Document

## Executive Summary

Linear provides a production-grade GraphQL API — the same API used internally to build the Linear application — exposed publicly at `https://api.linear.app/graphql`. The API supports two authentication methods: personal API keys (recommended for scripts and tooling) and OAuth 2.0 (recommended for multi-user applications). Personal API keys are passed directly in the `Authorization` header without a "Bearer" prefix, while OAuth tokens use `Authorization: Bearer <TOKEN>`.

The API uses Relay-style cursor-based pagination, a leaky-bucket rate limiting system, and a complexity-points model to protect against expensive queries. All mutations are observed in real-time by other Linear clients, making the API a first-class citizen for automation and integration work. A strongly-typed TypeScript SDK (`@linear/sdk`) wraps the raw GraphQL layer for JavaScript/TypeScript consumers.

This document covers all aspects needed to build a complete Linear integration: authentication, querying issues assigned to the authenticated user, reading full issue details, updating issue states, working with teams and workflow states, adding comments, and managing labels.

---

## Table of Contents

1. [Introduction and Background](#1-introduction-and-background)
2. [Authentication](#2-authentication)
3. [API Endpoint and Request Format](#3-api-endpoint-and-request-format)
4. [Core GraphQL Queries](#4-core-graphql-queries)
   - 4.1 [Get Authenticated User (viewer)](#41-get-authenticated-user-viewer)
   - 4.2 [List Issues Assigned to Me](#42-list-issues-assigned-to-me)
   - 4.3 [Get a Single Issue by ID](#43-get-a-single-issue-by-id)
   - 4.4 [List All Teams](#44-list-all-teams)
   - 4.5 [List Workflow States](#45-list-workflow-states)
   - 4.6 [List Issues with Filters](#46-list-issues-with-filters)
5. [Core GraphQL Mutations](#5-core-graphql-mutations)
   - 5.1 [Create an Issue](#51-create-an-issue)
   - 5.2 [Update an Issue (including state transition)](#52-update-an-issue-including-state-transition)
   - 5.3 [Add a Comment to an Issue](#53-add-a-comment-to-an-issue)
6. [GraphQL Schema Reference](#6-graphql-schema-reference)
   - 6.1 [Issue Type](#61-issue-type)
   - 6.2 [WorkflowState Type](#62-workflowstate-type)
   - 6.3 [Team Type](#63-team-type)
   - 6.4 [Comment Type](#64-comment-type)
   - 6.5 [User Type](#65-user-type)
   - 6.6 [IssueCreateInput](#66-issuecreateinput)
   - 6.7 [IssueUpdateInput](#67-issueupdateinput)
   - 6.8 [CommentCreateInput](#68-commentcreateinput)
7. [Filtering](#7-filtering)
8. [Pagination](#8-pagination)
9. [Rate Limiting and Complexity](#9-rate-limiting-and-complexity)
10. [Priority and State Values](#10-priority-and-state-values)
11. [TypeScript SDK Usage](#11-typescript-sdk-usage)
12. [Webhooks](#12-webhooks)
13. [Error Handling](#13-error-handling)
14. [Best Practices](#14-best-practices)
15. [Common Pitfalls and Troubleshooting](#15-common-pitfalls-and-troubleshooting)
16. [Complete Working Examples](#16-complete-working-examples)
17. [Resources and Further Reading](#17-resources-and-further-reading)

---

## 1. Introduction and Background

Linear is a project management tool focused on speed and developer workflows. Its public GraphQL API was made available to enable integrations, automations, and third-party tooling. According to Linear's documentation: "Linear's public API is built using GraphQL. It's the same API we use internally for developing our applications."

**Key characteristics:**
- Single GraphQL endpoint: `https://api.linear.app/graphql`
- Supports introspection — you can query the full schema via `__schema`
- All mutations propagate in real-time to all connected clients
- Relay-style cursor-based pagination
- Leaky-bucket rate limiting with complexity scoring
- Full TypeScript SDK available as `@linear/sdk` on npm

---

## 2. Authentication

### 2.1 Personal API Keys

Personal API keys are the simplest method for scripts, CLI tools, and server-side integrations where a single user's data is needed.

**Creating a personal API key:**
1. Go to Linear settings: **Settings > Account > Security & Access > Personal API Keys**
2. Click **New API Key**
3. Give it a label and select permissions (Read, Write, Admin, Create issues, Create comments)
4. Optionally restrict it to specific teams
5. Copy the key immediately — Linear will not show it again

**Key format:** API keys use the prefix `lin_api_`, for example:
```
lin_api_vw3gMdb2NJN9TQ66JCgBKLqNSNY6I8cH5qxwM6EW
```

**Authorization header for personal API keys (no "Bearer" prefix):**
```
Authorization: lin_api_YOUR_KEY_HERE
```

**Permissions available per key:**
- `read` — Read access to data accessible by the user
- `write` — Write permissions
- `issues:create` — Issue and attachment creation
- `comments:create` — Issue comment creation
- `admin` — Full access including admin endpoints

Keys can also be scoped to specific teams in a workspace.

**Key management:** API keys do not expire but can be revoked from the settings page. The workspace admin can control whether regular Members can create API keys via **Settings > Administration > API > Member API keys**.

### 2.2 OAuth 2.0 Authentication

OAuth 2.0 is recommended for applications that serve multiple users.

**Authorization header for OAuth tokens (Bearer prefix required):**
```
Authorization: Bearer YOUR_OAUTH_ACCESS_TOKEN
```

**Token lifetimes:**
- Apps created after October 1, 2025: 24-hour expiration with refresh tokens enabled by default
- Apps created before October 1, 2025: 10-year expiration (migration to refresh tokens required by April 1, 2026)

**OAuth scopes available:**
- `read` — Read access (always included)
- `write` — Write permissions
- `issues:create` — Issue and attachment creation
- `comments:create` — Comment creation
- `timeSchedule:write` — Time schedule management
- `admin` — Full admin-level access

---

## 3. API Endpoint and Request Format

**Endpoint:** `https://api.linear.app/graphql`

**HTTP Method:** POST

**Required headers:**
```
Content-Type: application/json
Authorization: lin_api_YOUR_KEY  (for API keys)
Authorization: Bearer YOUR_TOKEN  (for OAuth)
```

**Request body structure:**
```json
{
  "query": "query { viewer { id name email } }",
  "variables": { "optional": "variables" }
}
```

**cURL example:**
```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: lin_api_YOUR_KEY" \
  -d '{"query": "query { viewer { id name email } }"}'
```

**Python (requests) example:**
```python
import requests

url = "https://api.linear.app/graphql"
headers = {
    "Content-Type": "application/json",
    "Authorization": "lin_api_YOUR_KEY"  # No "Bearer" prefix for API keys
}

query = """
query {
  viewer {
    id
    name
    email
  }
}
"""

response = requests.post(url, json={"query": query}, headers=headers)
data = response.json()
```

**JavaScript (fetch) example:**
```javascript
const response = await fetch("https://api.linear.app/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "lin_api_YOUR_KEY",
  },
  body: JSON.stringify({ query: `query { viewer { id name email } }` }),
});
const data = await response.json();
```

---

## 4. Core GraphQL Queries

### 4.1 Get Authenticated User (viewer)

The `viewer` query returns the currently authenticated user. This is the starting point for most user-specific operations.

```graphql
query Me {
  viewer {
    id
    name
    email
    displayName
    avatarUrl
    admin
    active
    createdAt
    organization {
      id
      name
    }
  }
}
```

**Response structure:**
```json
{
  "data": {
    "viewer": {
      "id": "a1b2c3d4-...",
      "name": "Alice Smith",
      "email": "alice@example.com",
      "displayName": "Alice",
      "admin": false,
      "active": true,
      "createdAt": "2023-01-15T10:00:00.000Z",
      "organization": {
        "id": "org-uuid-here",
        "name": "Acme Corp"
      }
    }
  }
}
```

### 4.2 List Issues Assigned to Me

The `viewer` object has an `assignedIssues` field that returns all issues assigned to the authenticated user.

```graphql
query MyIssues {
  viewer {
    id
    name
    assignedIssues(first: 50) {
      nodes {
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
          color
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
            color
          }
        }
        dueDate
        createdAt
        updatedAt
        url
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

**Alternative: filter issues by assignee using the top-level issues query:**

```graphql
query MyAssignedIssues {
  issues(
    filter: {
      assignee: { isMe: { eq: true } }
    }
    first: 50
    orderBy: updatedAt
  ) {
    nodes {
      id
      identifier
      title
      state {
        id
        name
        type
      }
      priority
      dueDate
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Filter by assignee email (useful when you know the email):**

```graphql
query IssuesByEmail {
  issues(
    filter: {
      assignee: { email: { eq: "alice@example.com" } }
    }
  ) {
    nodes {
      id
      identifier
      title
    }
  }
}
```

### 4.3 Get a Single Issue by ID

The `issue` query accepts either a UUID or a shorthand identifier like `ENG-123`.

```graphql
query GetIssue($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    description
    priority
    priorityLabel
    estimate
    dueDate
    state {
      id
      name
      type
      color
    }
    team {
      id
      name
      key
    }
    assignee {
      id
      name
      email
      displayName
      avatarUrl
    }
    creator {
      id
      name
    }
    labels {
      nodes {
        id
        name
        color
      }
    }
    project {
      id
      name
    }
    cycle {
      id
      name
      number
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
    createdAt
    updatedAt
    archivedAt
    url
  }
}
```

**Variables:**
```json
{
  "id": "ENG-123"
}
```

Or using a UUID:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### 4.4 List All Teams

```graphql
query Teams {
  teams {
    nodes {
      id
      name
      key
      description
      color
      icon
      private
      timezone
      issueCount
      organization {
        id
        name
      }
    }
  }
}
```

**List teams with their workflow states in one query:**

```graphql
query TeamsWithStates {
  teams {
    nodes {
      id
      name
      key
      workflowStates {
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
}
```

**Get a single team by ID:**

```graphql
query Team($id: String!) {
  team(id: $id) {
    id
    name
    key
    workflowStates {
      nodes {
        id
        name
        type
        color
      }
    }
    members {
      nodes {
        id
        name
        email
      }
    }
  }
}
```

### 4.5 List Workflow States

**All workflow states across all teams:**

```graphql
query WorkflowStates {
  workflowStates {
    nodes {
      id
      name
      type
      color
      position
      team {
        id
        name
      }
    }
  }
}
```

**Workflow states for a specific team (more common pattern):**

```graphql
query TeamStates($teamId: String!) {
  workflowStates(filter: { team: { id: { eq: $teamId } } }) {
    nodes {
      id
      name
      type
      color
      position
    }
  }
}
```

**WorkflowState type values** (`type` field on WorkflowState):
- `triage` — For triaging new issues
- `backlog` — Not yet started
- `unstarted` — Ready to work on
- `started` — Currently in progress
- `completed` — Done / finished
- `canceled` — Cancelled / won't fix

This means "In Progress" type states have `type: "started"`, "Todo" type states have `type: "unstarted"` or `type: "backlog"`, and "Done" type states have `type: "completed"`.

**Get issues for a specific workflow state:**

```graphql
query StateIssues($stateId: String!) {
  workflowState(id: $stateId) {
    id
    name
    type
    issues {
      nodes {
        id
        identifier
        title
        assignee {
          name
        }
      }
    }
  }
}
```

### 4.6 List Issues with Filters

Linear's filtering system is powerful. All filter conditions combine with AND logic by default.

```graphql
query FilteredIssues {
  issues(
    filter: {
      state: { type: { eq: "started" } }
      team: { id: { eq: "TEAM_UUID" } }
    }
    first: 25
    orderBy: updatedAt
  ) {
    nodes {
      id
      identifier
      title
      state { name }
      assignee { name }
      priority
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Get all open issues (not completed or canceled):**

```graphql
query OpenIssues {
  issues(
    filter: {
      state: {
        type: { nin: ["completed", "canceled"] }
      }
    }
  ) {
    nodes {
      id
      identifier
      title
      state { name type }
    }
  }
}
```

**High-priority issues due soon:**

```graphql
query UrgentIssues {
  issues(
    filter: {
      priority: { lte: 2, neq: 0 }
      dueDate: { lt: "P2W" }
    }
  ) {
    nodes {
      id
      identifier
      title
      priority
      dueDate
    }
  }
}
```

**Issues with specific labels:**

```graphql
query BugIssues {
  issues(
    filter: {
      labels: { name: { in: ["Bug", "Defect"] } }
    }
  ) {
    nodes {
      id
      identifier
      title
      labels {
        nodes { name color }
      }
    }
  }
}
```

---

## 5. Core GraphQL Mutations

### 5.1 Create an Issue

The `issueCreate` mutation requires `teamId` and `title` at minimum. All other fields are optional.

```graphql
mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
      url
    }
  }
}
```

**Variables (minimal):**
```json
{
  "input": {
    "teamId": "TEAM_UUID",
    "title": "Fix login button not working"
  }
}
```

**Variables (fully populated):**
```json
{
  "input": {
    "teamId": "TEAM_UUID",
    "title": "Fix login button not working on mobile",
    "description": "The login button does not respond to taps on iOS 17. Steps to reproduce: 1. Open app on iPhone. 2. Tap Login. 3. Nothing happens.",
    "stateId": "STATE_UUID",
    "assigneeId": "USER_UUID",
    "priority": 2,
    "labelIds": ["LABEL_UUID_1", "LABEL_UUID_2"],
    "projectId": "PROJECT_UUID",
    "cycleId": "CYCLE_UUID",
    "parentId": "PARENT_ISSUE_UUID",
    "dueDate": "2025-03-31",
    "estimate": 3,
    "subscriberIds": ["USER_UUID_1", "USER_UUID_2"]
  }
}
```

**Python implementation:**
```python
import requests

url = "https://api.linear.app/graphql"
headers = {
    "Content-Type": "application/json",
    "Authorization": "lin_api_YOUR_KEY"
}

mutation = """
mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
    }
  }
}
"""

variables = {
    "input": {
        "teamId": "your-team-uuid",
        "title": "New bug found in checkout flow",
        "description": "Detailed description here",
        "priority": 2  # 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low
    }
}

response = requests.post(
    url,
    json={"query": mutation, "variables": variables},
    headers=headers
)
result = response.json()

if result["data"]["issueCreate"]["success"]:
    issue = result["data"]["issueCreate"]["issue"]
    print(f"Created issue: {issue['identifier']} - {issue['title']}")
```

### 5.2 Update an Issue (including state transition)

Use `issueUpdate` to change any issue field, including transitioning to a new workflow state. The `id` parameter accepts both UUID and shorthand identifiers (e.g., `ENG-123`).

**State transition workflow:**

Step 1 — Query available workflow states for the team:
```graphql
query GetStates($teamId: String!) {
  workflowStates(filter: { team: { id: { eq: $teamId } } }) {
    nodes {
      id
      name
      type
    }
  }
}
```

Step 2 — Use the state UUID to update the issue:
```graphql
mutation UpdateIssueState($id: String!, $stateId: String!) {
  issueUpdate(
    id: $id
    input: { stateId: $stateId }
  ) {
    success
    issue {
      id
      identifier
      title
      state {
        id
        name
        type
      }
    }
  }
}
```

**Variables:**
```json
{
  "id": "ENG-42",
  "stateId": "uuid-of-in-progress-state"
}
```

**Full update mutation with all common fields:**
```graphql
mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id
      identifier
      title
      description
      priority
      state {
        id
        name
        type
      }
      assignee {
        id
        name
      }
      labels {
        nodes {
          id
          name
        }
      }
      dueDate
      estimate
    }
  }
}
```

**Variables for comprehensive update:**
```json
{
  "id": "ENG-42",
  "input": {
    "title": "Updated title",
    "description": "Updated description",
    "stateId": "STATE_UUID",
    "assigneeId": "USER_UUID",
    "priority": 1,
    "labelIds": ["LABEL_UUID_1"],
    "dueDate": "2025-04-15",
    "estimate": 5
  }
}
```

**Important note on labels:** The `labelIds` field in `IssueUpdateInput` replaces all existing labels. To add a label without removing existing ones, you must first read the current `labels.nodes` from the issue and include all existing label IDs plus the new one in your update.

**Python example — transition issue to "In Progress":**
```python
import requests

def get_workflow_states(api_key, team_id):
    url = "https://api.linear.app/graphql"
    headers = {
        "Content-Type": "application/json",
        "Authorization": api_key
    }
    query = """
    query GetStates($teamId: String!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes {
          id
          name
          type
        }
      }
    }
    """
    response = requests.post(
        url,
        json={"query": query, "variables": {"teamId": team_id}},
        headers=headers
    )
    return response.json()["data"]["workflowStates"]["nodes"]

def update_issue_state(api_key, issue_id, state_id):
    url = "https://api.linear.app/graphql"
    headers = {
        "Content-Type": "application/json",
        "Authorization": api_key
    }
    mutation = """
    mutation UpdateIssueState($id: String!, $stateId: String!) {
      issueUpdate(
        id: $id
        input: { stateId: $stateId }
      ) {
        success
        issue {
          id
          identifier
          state { name }
        }
      }
    }
    """
    variables = {"id": issue_id, "stateId": state_id}
    response = requests.post(
        url,
        json={"query": mutation, "variables": variables},
        headers=headers
    )
    return response.json()["data"]["issueUpdate"]

api_key = "lin_api_YOUR_KEY"
team_id = "your-team-uuid"

# Find the "In Progress" state
states = get_workflow_states(api_key, team_id)
in_progress = next(s for s in states if s["type"] == "started" and "progress" in s["name"].lower())

# Move issue to In Progress
result = update_issue_state(api_key, "ENG-42", in_progress["id"])
if result["success"]:
    print(f"Issue now in: {result['issue']['state']['name']}")
```

### 5.3 Add a Comment to an Issue

```graphql
mutation AddComment($input: CommentCreateInput!) {
  commentCreate(input: $input) {
    success
    comment {
      id
      body
      createdAt
      user {
        id
        name
      }
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "issueId": "ISSUE_UUID_OR_IDENTIFIER",
    "body": "This is a comment. It supports **markdown** formatting.\n\n- Item 1\n- Item 2"
  }
}
```

**CommentCreateInput fields:**
- `issueId` (required) — UUID or identifier of the issue to comment on
- `body` (required) — Comment text in Markdown format
- `bodyData` — Alternative rich text format
- `parentId` — UUID of parent comment for threaded replies
- `createdAt` — Optional override for creation timestamp
- `subscriberIds` — Array of user UUIDs to notify

**Python example:**
```python
import requests

def add_comment(api_key, issue_id, comment_body):
    url = "https://api.linear.app/graphql"
    headers = {
        "Content-Type": "application/json",
        "Authorization": api_key
    }
    mutation = """
    mutation AddComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment {
          id
          body
          createdAt
        }
      }
    }
    """
    variables = {
        "input": {
            "issueId": issue_id,
            "body": comment_body
        }
    }
    response = requests.post(
        url,
        json={"query": mutation, "variables": variables},
        headers=headers
    )
    result = response.json()
    return result["data"]["commentCreate"]

result = add_comment(
    "lin_api_YOUR_KEY",
    "ENG-42",
    "Investigated this issue. Root cause is in `auth/login.ts` line 47. PR incoming."
)
print(f"Comment added: {result['comment']['id']}")
```

---

## 6. GraphQL Schema Reference

### 6.1 Issue Type

The `Issue` type contains the core work item data. Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `ID!` | UUID identifier |
| `identifier` | `String!` | Human-readable ID like `ENG-123` |
| `number` | `Float!` | Sequential number within team |
| `title` | `String!` | Issue title |
| `description` | `String` | Full description (Markdown) |
| `priority` | `Float!` | 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low |
| `priorityLabel` | `String!` | Human-readable priority label |
| `estimate` | `Float` | Story point estimate |
| `dueDate` | `TimelessDate` | Due date in YYYY-MM-DD format |
| `state` | `WorkflowState!` | Current workflow state |
| `team` | `Team!` | Owning team |
| `assignee` | `User` | Assigned user (nullable) |
| `creator` | `User` | User who created the issue |
| `labels` | `IssueLabelConnection!` | Labels connection |
| `project` | `Project` | Associated project (nullable) |
| `cycle` | `Cycle` | Associated cycle/sprint (nullable) |
| `parent` | `Issue` | Parent issue for sub-issues (nullable) |
| `children` | `IssueConnection!` | Sub-issues connection |
| `comments` | `CommentConnection!` | Comments connection |
| `relations` | `IssueRelationConnection!` | Related issues |
| `subscribers` | `UserConnection!` | Subscribed users |
| `url` | `String!` | Direct URL to issue in app |
| `branchName` | `String!` | Suggested git branch name |
| `createdAt` | `DateTime!` | Creation timestamp |
| `updatedAt` | `DateTime!` | Last update timestamp |
| `archivedAt` | `DateTime` | Archival timestamp (nullable) |
| `completedAt` | `DateTime` | Completion timestamp (nullable) |
| `canceledAt` | `DateTime` | Cancellation timestamp (nullable) |
| `startedAt` | `DateTime` | When issue entered "started" state (nullable) |
| `triagedAt` | `DateTime` | When issue was triaged (nullable) |
| `snoozedUntilAt` | `DateTime` | Snooze timestamp (nullable) |
| `sortOrder` | `Float!` | Internal ordering float |

### 6.2 WorkflowState Type

| Field | Type | Description |
|-------|------|-------------|
| `id` | `ID!` | UUID identifier |
| `name` | `String!` | Display name (e.g., "In Progress") |
| `type` | `String!` | Category: `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled` |
| `color` | `String!` | Hex color code |
| `position` | `Float!` | Ordering position |
| `team` | `Team!` | Owning team |
| `issues` | `IssueConnection!` | Issues in this state |
| `createdAt` | `DateTime!` | Creation timestamp |
| `updatedAt` | `DateTime!` | Last update timestamp |
| `archivedAt` | `DateTime` | Archival timestamp (nullable) |

### 6.3 Team Type

| Field | Type | Description |
|-------|------|-------------|
| `id` | `ID!` | UUID identifier |
| `name` | `String!` | Team display name |
| `key` | `String!` | Team shorthand key (e.g., "ENG") |
| `description` | `String` | Team description |
| `color` | `String` | Team color |
| `icon` | `String` | Team icon |
| `private` | `Boolean!` | Whether team is private |
| `timezone` | `String!` | Team timezone |
| `issueCount` | `Int!` | Total number of issues |
| `organization` | `Organization!` | Parent organization |
| `workflowStates` | `WorkflowStateConnection!` | Team's workflow states |
| `members` | `UserConnection!` | Team members |
| `issues` | `IssueConnection!` | Team issues |
| `labels` | `IssueLabelConnection!` | Team labels |
| `projects` | `ProjectConnection!` | Team projects |
| `cycles` | `CycleConnection!` | Team cycles/sprints |
| `createdAt` | `DateTime!` | Creation timestamp |
| `updatedAt` | `DateTime!` | Last update timestamp |

### 6.4 Comment Type

| Field | Type | Description |
|-------|------|-------------|
| `id` | `ID!` | UUID identifier |
| `body` | `String!` | Comment text in Markdown |
| `bodyData` | `String!` | Rich text format data |
| `user` | `User!` | Comment author |
| `issue` | `Issue!` | Parent issue |
| `parent` | `Comment` | Parent comment for threads (nullable) |
| `children` | `CommentConnection!` | Threaded replies |
| `reactions` | `[Reaction!]!` | Emoji reactions |
| `createdAt` | `DateTime!` | Creation timestamp |
| `updatedAt` | `DateTime!` | Last update timestamp |
| `editedAt` | `DateTime` | Last edit timestamp (nullable) |
| `archivedAt` | `DateTime` | Archival timestamp (nullable) |

### 6.5 User Type

| Field | Type | Description |
|-------|------|-------------|
| `id` | `ID!` | UUID identifier |
| `name` | `String!` | Full name |
| `displayName` | `String!` | Display name |
| `email` | `String!` | Email address |
| `avatarUrl` | `String` | Avatar image URL (nullable) |
| `admin` | `Boolean!` | Whether user is admin |
| `active` | `Boolean!` | Whether user account is active |
| `guest` | `Boolean!` | Whether user is a guest |
| `organization` | `Organization!` | User's organization |
| `teams` | `TeamConnection!` | Teams user belongs to |
| `assignedIssues` | `IssueConnection!` | Issues assigned to user |
| `createdIssues` | `IssueConnection!` | Issues created by user |
| `createdAt` | `DateTime!` | Account creation timestamp |
| `updatedAt` | `DateTime!` | Last update timestamp |
| `archivedAt` | `DateTime` | Archival timestamp (nullable) |

### 6.6 IssueCreateInput

Input fields for creating a new issue:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `teamId` | `String!` | Yes | UUID of the owning team |
| `title` | `String!` | Yes | Issue title |
| `description` | `String` | No | Description in Markdown |
| `stateId` | `String` | No | UUID of initial workflow state |
| `assigneeId` | `String` | No | UUID of assigned user |
| `priority` | `Int` | No | 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low |
| `labelIds` | `[String!]` | No | Array of label UUIDs |
| `projectId` | `String` | No | UUID of project |
| `cycleId` | `String` | No | UUID of cycle/sprint |
| `parentId` | `String` | No | UUID of parent issue |
| `dueDate` | `TimelessDateScalar` | No | Due date in YYYY-MM-DD |
| `estimate` | `Int` | No | Story point estimate |
| `subscriberIds` | `[String!]` | No | User UUIDs to subscribe |
| `createdAt` | `DateTime` | No | Override creation timestamp |
| `completedAt` | `DateTime` | No | Pre-set completion time |
| `boardOrder` | `Float` | No | Position in board view |
| `sortOrder` | `Float` | No | Custom sort position |

### 6.7 IssueUpdateInput

Input fields for updating an existing issue. All fields are optional:

| Field | Type | Description |
|-------|------|-------------|
| `title` | `String` | New title |
| `description` | `String` | New description in Markdown |
| `stateId` | `String` | UUID of new workflow state |
| `assigneeId` | `String` | UUID of new assignee (null to unassign) |
| `priority` | `Int` | New priority value |
| `labelIds` | `[String!]` | Full replacement set of label UUIDs |
| `projectId` | `String` | UUID of new project |
| `cycleId` | `String` | UUID of new cycle |
| `parentId` | `String` | UUID of new parent issue |
| `dueDate` | `TimelessDateScalar` | New due date |
| `estimate` | `Int` | New story point estimate |
| `subscriberIds` | `[String!]` | New subscriber list |
| `snoozedUntilAt` | `DateTime` | Snooze the issue until this time |
| `archivedAt` | `DateTime` | Archive timestamp |
| `completedAt` | `DateTime` | Mark completion time |
| `canceledAt` | `DateTime` | Mark cancellation time |
| `sortOrder` | `Float` | Custom sort order |
| `boardOrder` | `Float` | Board position |

### 6.8 CommentCreateInput

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issueId` | `String!` | Yes | UUID or identifier of the parent issue |
| `body` | `String!` | Yes | Comment text in Markdown |
| `bodyData` | `JSON` | No | Rich text format alternative |
| `parentId` | `String` | No | UUID of parent comment for threading |
| `createdAt` | `DateTime` | No | Override creation timestamp |
| `subscriberIds` | `[String!]` | No | User UUIDs to notify |

---

## 7. Filtering

Linear provides a robust filtering system for paginated queries.

### Filter Operators

| Operator | Applies To | Description |
|----------|------------|-------------|
| `eq` | All types | Exact equality |
| `neq` | All types | Not equal |
| `in` | All types | Value is in the array |
| `nin` | All types | Value is not in the array |
| `null` | All types | Boolean — field is null (true) or not null (false) |
| `lt` | Numbers, Dates | Less than |
| `lte` | Numbers, Dates | Less than or equal |
| `gt` | Numbers, Dates | Greater than |
| `gte` | Numbers, Dates | Greater than or equal |
| `contains` | Strings | Substring match |
| `containsIgnoreCase` | Strings | Case-insensitive substring match |
| `startsWith` | Strings | String starts with value |
| `endsWith` | Strings | String ends with value |
| `eqIgnoreCase` | Strings | Case-insensitive equality |
| `neqIgnoreCase` | Strings | Case-insensitive not-equal |

### Logical Combinations

By default, all filter conditions are combined with AND logic. Use `or` for OR logic:

```graphql
query {
  issues(
    filter: {
      or: [
        { assignee: { email: { eq: "alice@example.com" } } }
        { assignee: { email: { eq: "bob@example.com" } } }
      ]
    }
  ) {
    nodes { id title }
  }
}
```

### Date Filtering with ISO 8601 Durations

Date fields support relative filtering using ISO 8601 duration format. This makes filters work dynamically without hardcoding dates:

```graphql
query IssuesDueInTwoWeeks {
  issues(
    filter: {
      dueDate: { lt: "P2W" }  # Due in the next 2 weeks
    }
  ) {
    nodes { id title dueDate }
  }
}
```

Duration format: `P[n]Y[n]M[n]DT[n]H[n]M[n]S`
- `P1D` — 1 day
- `P2W` — 2 weeks
- `P1M` — 1 month
- `P1Y` — 1 year

### Common Filter Patterns

```graphql
# Issues by me that are currently in progress
filter: {
  assignee: { isMe: { eq: true } }
  state: { type: { eq: "started" } }
}

# High or urgent priority issues
filter: {
  priority: { in: [1, 2] }
}

# Issues with no assignee
filter: {
  assignee: { null: true }
}

# Issues in a specific project
filter: {
  project: { id: { eq: "PROJECT_UUID" } }
}

# Issues not archived
filter: {
  archivedAt: { null: true }
}
```

---

## 8. Pagination

Linear implements Relay-style cursor-based pagination.

### Pagination Parameters

| Parameter | Description |
|-----------|-------------|
| `first` | Number of results from the beginning (max 250) |
| `after` | Cursor for next page (forward pagination) |
| `last` | Number of results from the end |
| `before` | Cursor for previous page (backward pagination) |
| `orderBy` | Sort field: `createdAt` (default) or `updatedAt` |

Default page size is 50 records if no `first` or `last` argument is provided.

### Response Structure

```graphql
{
  nodes: [...],        # Array of result objects
  pageInfo: {
    hasNextPage: true,
    hasPreviousPage: false,
    startCursor: "cursor-value",
    endCursor: "cursor-value"
  },
  edges: [             # Alternative to nodes (full Relay spec)
    {
      node: {...},
      cursor: "cursor-value"
    }
  ]
}
```

### Paginating Through Results

```graphql
query PaginatedIssues($after: String) {
  issues(first: 50, after: $after, orderBy: updatedAt) {
    nodes {
      id
      identifier
      title
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Python implementation for fetching all pages:**
```python
import requests

def fetch_all_issues(api_key):
    url = "https://api.linear.app/graphql"
    headers = {
        "Content-Type": "application/json",
        "Authorization": api_key
    }

    query = """
    query AllIssues($after: String) {
      issues(first: 50, after: $after, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          state { name type }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
    """

    all_issues = []
    cursor = None

    while True:
        variables = {"after": cursor} if cursor else {}
        response = requests.post(
            url,
            json={"query": query, "variables": variables},
            headers=headers
        )
        data = response.json()["data"]["issues"]
        all_issues.extend(data["nodes"])

        if not data["pageInfo"]["hasNextPage"]:
            break
        cursor = data["pageInfo"]["endCursor"]

    return all_issues
```

---

## 9. Rate Limiting and Complexity

### Request Rate Limits

| Authentication | Requests per Hour |
|---------------|------------------|
| API Key (personal) | 5,000 |
| OAuth (per user/app) | 5,000 (shared) |
| Unauthenticated | 60 |

The rate limiting uses a leaky bucket algorithm where tokens refill at `LIMIT_AMOUNT / LIMIT_PERIOD`.

### Complexity Limits

Linear calculates a complexity score for each query based on data requested. The formula is approximately:
- Each scalar property = 0.1 point
- Each object relation = 1 point
- Connection size multiplies by pagination argument (default 50)

| Authentication | Complexity Points per Hour | Max Single Query |
|---------------|---------------------------|-----------------|
| API Key | 250,000 | 10,000 |
| OAuth (with Actor Auth) | 2,000,000 | 10,000 |
| Unauthenticated | 10,000 | 10,000 |

### Rate Limit Response Headers

Every response includes these headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Requests-Limit` | Maximum requests allowed |
| `X-RateLimit-Requests-Remaining` | Requests remaining in window |
| `X-RateLimit-Requests-Reset` | Window reset time (UTC epoch ms) |
| `X-Complexity` | Complexity score of current query |
| `X-RateLimit-Complexity-Limit` | Maximum complexity allowed |
| `X-RateLimit-Complexity-Remaining` | Complexity remaining |
| `X-RateLimit-Complexity-Reset` | Complexity window reset time |

### Rate Limit Error

When limits are exceeded, you receive HTTP 400 with:
```json
{
  "errors": [{
    "message": "Too many requests",
    "extensions": {
      "code": "RATELIMITED"
    }
  }]
}
```

### Complexity Optimization Tips

1. Use `first: N` to limit pagination size explicitly
2. Request only the fields you need
3. Avoid deeply nested queries when shallow queries suffice
4. Use filters to narrow the dataset before pagination

---

## 10. Priority and State Values

### Priority Values

| Value | Label |
|-------|-------|
| `0` | No priority |
| `1` | Urgent |
| `2` | High |
| `3` | Medium |
| `4` | Low |

**Filtering for urgent or high priority:**
```graphql
filter: { priority: { lte: 2, neq: 0 } }
```

### WorkflowState Type Values

| Type | Description | Typical names |
|------|-------------|---------------|
| `triage` | Incoming / triage queue | "Triage" |
| `backlog` | Backlog items | "Backlog" |
| `unstarted` | Ready but not started | "Todo", "Ready" |
| `started` | In progress | "In Progress", "In Review" |
| `completed` | Done | "Done", "Completed", "Released" |
| `canceled` | Cancelled | "Cancelled", "Won't Fix", "Duplicate" |

### Estimate (Story Points) Values for T-Shirt Sizing

If a team uses t-shirt size estimates, the point mappings are:
- No estimate: `0`
- XS: `1`
- S: `2`
- M: `3`
- L: `5`
- XL: `8`
- XXL: `13`
- XXXL: `21`

---

## 11. TypeScript SDK Usage

The `@linear/sdk` package provides a strongly-typed SDK for JavaScript and TypeScript applications.

### Installation

```bash
npm install @linear/sdk
```

### Initialization

```typescript
import { LinearClient } from '@linear/sdk';

// With personal API key
const client = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY
});

// With OAuth token
const client = new LinearClient({
  accessToken: process.env.LINEAR_ACCESS_TOKEN
});
```

### Common SDK Operations

```typescript
// Get current user
const me = await client.viewer;
console.log(me.name, me.email);

// Get issues assigned to me
const myIssues = await me.assignedIssues({ first: 50 });
for (const issue of myIssues.nodes) {
  console.log(`${issue.identifier}: ${issue.title}`);
}

// Get all teams
const teams = await client.teams();
const team = teams.nodes[0];

// Get a specific issue
const issue = await client.issue("ENG-42");
const state = await issue.state;
const assignee = await issue.assignee;

// Create an issue
const result = await client.createIssue({
  teamId: team.id,
  title: "Fix the login button",
  description: "Steps to reproduce...",
  priority: 2
});
if (result.success) {
  const newIssue = await result.issue;
  console.log(`Created: ${newIssue?.identifier}`);
}

// Update issue state
await client.updateIssue("ENG-42", {
  stateId: "state-uuid-here"
});

// Add a comment
const commentResult = await client.createComment({
  issueId: "ENG-42",
  body: "This is my comment with **markdown** support."
});

// Paginate through all issues
let hasMore = true;
let cursor: string | undefined;
while (hasMore) {
  const page = await client.issues({ first: 50, after: cursor });
  for (const issue of page.nodes) {
    // process issue
  }
  hasMore = page.pageInfo.hasNextPage;
  cursor = page.pageInfo.endCursor ?? undefined;
}

// Use fetchNext helper
const issues = await client.issues({ first: 50 });
if (issues.pageInfo.hasNextPage) {
  const nextPage = await issues.fetchNext();
}
```

---

## 12. Webhooks

Webhooks provide real-time push notifications when Linear data changes. This is preferred over polling for integration use cases.

### Supported Event Types

- Issues (create, update, remove)
- Issue attachments
- Comments
- Issue labels
- Comment reactions
- Projects and project updates
- Documents
- Initiatives and initiative updates
- Cycles
- Customers and customer requests
- Users
- Issue SLA events
- OAuthApp revoked

### Webhook Payload Structure

All event payloads share this structure:

```json
{
  "action": "create",
  "type": "Issue",
  "createdAt": "2025-02-27T12:00:00.000Z",
  "organizationId": "org-uuid",
  "webhookTimestamp": 1740657600000,
  "webhookId": "webhook-uuid",
  "url": "https://linear.app/team/issue/ENG-42",
  "actor": {
    "id": "user-uuid",
    "name": "Alice Smith",
    "email": "alice@example.com",
    "type": "user"
  },
  "data": {
    "id": "issue-uuid",
    "createdAt": "2025-02-27T12:00:00.000Z",
    "updatedAt": "2025-02-27T12:00:00.000Z",
    "number": 42,
    "title": "Fix login button",
    "priority": 2,
    "estimate": 3,
    "teamId": "team-uuid",
    "stateId": "state-uuid",
    "assigneeId": "user-uuid",
    "creatorId": "user-uuid",
    "labelIds": ["label-uuid"],
    "description": "Issue description here",
    "url": "https://linear.app/team/issue/ENG-42"
  },
  "updatedFrom": {
    "stateId": "old-state-uuid"
  }
}
```

Note: `updatedFrom` only appears on "update" actions and contains the previous values of changed fields.

### Security: Signature Verification

```python
import hashlib
import hmac
import time

def verify_webhook(signing_secret: str, signature: str, body: bytes, timestamp: int) -> bool:
    # Reject requests older than 60 seconds
    if abs(time.time() - timestamp / 1000) > 60:
        return False

    # Compute expected signature
    expected = hmac.new(
        signing_secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    # Use timing-safe comparison
    return hmac.compare_digest(expected, signature)
```

### Creating a Webhook via API

```graphql
mutation CreateWebhook {
  webhookCreate(input: {
    url: "https://your-server.com/linear-webhook"
    teamId: "TEAM_UUID"
    resourceTypes: ["Issue", "Comment"]
    enabled: true
  }) {
    success
    webhook {
      id
      url
      enabled
      resourceTypes
    }
  }
}
```

### Linear Webhook Source IPs (for firewall allowlisting)

- `35.231.147.226`
- `35.243.134.228`
- `34.140.253.14`
- `34.38.87.206`
- `34.134.222.122`
- `35.222.25.142`

---

## 13. Error Handling

### GraphQL Error Format

GraphQL responses can return HTTP 200 while containing errors for specific fields. Always check the `errors` array:

```json
{
  "data": null,
  "errors": [
    {
      "message": "Entity not found",
      "path": ["issue"],
      "extensions": {
        "code": "NOT_FOUND",
        "type": "issue"
      }
    }
  ]
}
```

### Common Error Codes

| HTTP Status | Error Code | Description |
|-------------|-----------|-------------|
| 200 | `NOT_FOUND` | Entity does not exist or is not accessible |
| 200 | `PERMISSION_DENIED` | API key lacks required permissions |
| 400 | `RATELIMITED` | Rate limit or complexity limit exceeded |
| 400 | `BAD_REQUEST` | Invalid query syntax or missing required fields |
| 401 | — | Missing or invalid API key |
| 429 | — | Too many requests (HTTP-level rate limit) |

### Robust Error Handling Pattern

```python
import requests

def graphql_request(api_key, query, variables=None):
    url = "https://api.linear.app/graphql"
    headers = {
        "Content-Type": "application/json",
        "Authorization": api_key
    }

    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    response = requests.post(url, json=payload, headers=headers)

    # Check HTTP-level errors
    if response.status_code == 401:
        raise ValueError("Invalid or missing API key")
    if response.status_code == 429:
        raise RuntimeError("HTTP rate limit exceeded")

    data = response.json()

    # Check GraphQL-level errors
    if "errors" in data:
        for error in data["errors"]:
            code = error.get("extensions", {}).get("code", "UNKNOWN")
            if code == "RATELIMITED":
                raise RuntimeError(f"Rate limited: {error['message']}")
            raise ValueError(f"GraphQL error [{code}]: {error['message']}")

    # Check remaining rate limit headers
    remaining = response.headers.get("X-RateLimit-Requests-Remaining")
    if remaining and int(remaining) < 100:
        print(f"Warning: only {remaining} requests remaining in window")

    return data["data"]
```

---

## 14. Best Practices

### Authentication

- Store API keys as environment variables, never hardcode them
- Use the minimal required permissions for each key
- Scope keys to specific teams when only one team's data is needed
- Rotate keys regularly for sensitive automation

### Query Efficiency

- Request only the fields you need — avoid selecting all fields by default
- Use filters in the GraphQL query itself, not in application code after fetching
- Specify explicit `first:` values rather than relying on the default of 50
- Use `orderBy: updatedAt` when polling for changes to minimize missed updates
- Use `includeArchived: true` only when you actually need archived data

### Rate Limit Management

- Monitor `X-RateLimit-Requests-Remaining` headers
- Implement exponential backoff for `RATELIMITED` errors
- Prefer webhooks over polling for real-time data needs
- Avoid fetching deep nested connections in a single query

### State Transitions

- Always query `workflowStates` for the specific team before attempting state changes
- Cache workflow state UUIDs — they change rarely
- Check `state.type` instead of `state.name` for programmatic state logic (names are user-customizable, types are not)

### Labels

- Remember that `labelIds` in `IssueUpdateInput` is a full replacement, not an append
- Read the current `labels.nodes` before updating to preserve existing labels

### Pagination

- Always check `pageInfo.hasNextPage` rather than relying on result count
- Use the SDK's `fetchNext()` helper for cleaner pagination in TypeScript

---

## 15. Common Pitfalls and Troubleshooting

### "Authorization" header format

**Wrong for API keys:**
```
Authorization: Bearer lin_api_YOUR_KEY  # INCORRECT
```
**Correct for API keys:**
```
Authorization: lin_api_YOUR_KEY  # CORRECT — no "Bearer" prefix
```
**Correct for OAuth:**
```
Authorization: Bearer YOUR_OAUTH_TOKEN  # CORRECT — "Bearer" prefix required
```

### Replacing labels accidentally

`labelIds` in update operations replaces all labels. If you want to add one label:
```python
# Read current labels first
issue = fetch_issue(issue_id)
existing_ids = [label["id"] for label in issue["labels"]["nodes"]]
new_ids = existing_ids + ["new-label-uuid"]
# Then update with the full set
update_issue(issue_id, {"labelIds": new_ids})
```

### "Entity not found" for valid issues

This usually means:
1. The API key does not have access to that team
2. The issue is in an archived state — add `includeArchived: true` to the query
3. The UUID is correct but is for a different entity type

### stateId must be from the issue's own team

Workflow state UUIDs are team-specific. Using a state UUID from Team A on an issue in Team B will fail. Always query states from the correct team.

### Complexity limit hit on deep nested queries

Avoid patterns like:
```graphql
# BAD — very high complexity
teams {
  nodes {
    issues {          # 50 issues per team
      nodes {
        comments {    # 50 comments per issue
          nodes {
            user { ... }
          }
        }
      }
    }
  }
}
```

Flatten the query or reduce pagination sizes with explicit `first:` arguments.

### Rate limit 429 vs GraphQL RATELIMITED

- HTTP 429 is the HTTP-level rate limit (requests per hour)
- GraphQL `RATELIMITED` code in `errors` array is the complexity-level limit
- Both require backing off — check the `X-RateLimit-*-Reset` header to know when to retry

---

## 16. Complete Working Examples

### Example 1: Full Issue Detail Fetch

```python
import requests
import os

LINEAR_API_KEY = os.environ["LINEAR_API_KEY"]
GRAPHQL_URL = "https://api.linear.app/graphql"

def get_issue_details(issue_id: str) -> dict:
    query = """
    query GetIssue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        priority
        priorityLabel
        estimate
        dueDate
        state {
          id
          name
          type
          color
        }
        team {
          id
          name
          key
        }
        assignee {
          id
          name
          email
        }
        creator {
          id
          name
        }
        labels {
          nodes {
            id
            name
            color
          }
        }
        comments {
          nodes {
            id
            body
            user { name }
            createdAt
          }
        }
        createdAt
        updatedAt
        url
      }
    }
    """

    response = requests.post(
        GRAPHQL_URL,
        json={"query": query, "variables": {"id": issue_id}},
        headers={
            "Content-Type": "application/json",
            "Authorization": LINEAR_API_KEY
        }
    )
    response.raise_for_status()
    data = response.json()

    if "errors" in data:
        raise ValueError(data["errors"][0]["message"])

    return data["data"]["issue"]

issue = get_issue_details("ENG-42")
print(f"Title: {issue['title']}")
print(f"State: {issue['state']['name']} ({issue['state']['type']})")
print(f"Priority: {issue['priorityLabel']}")
print(f"Assignee: {issue['assignee']['name'] if issue['assignee'] else 'Unassigned'}")
```

### Example 2: Transition Issue Through States

```python
import requests
import os
from typing import Optional

LINEAR_API_KEY = os.environ["LINEAR_API_KEY"]
GRAPHQL_URL = "https://api.linear.app/graphql"

def graphql(query: str, variables: Optional[dict] = None) -> dict:
    response = requests.post(
        GRAPHQL_URL,
        json={"query": query, "variables": variables or {}},
        headers={
            "Content-Type": "application/json",
            "Authorization": LINEAR_API_KEY
        }
    )
    data = response.json()
    if "errors" in data:
        raise ValueError(data["errors"][0]["message"])
    return data["data"]

def get_team_states(team_id: str) -> list[dict]:
    result = graphql("""
    query GetStates($teamId: String!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes {
          id
          name
          type
          position
        }
      }
    }
    """, {"teamId": team_id})
    states = result["workflowStates"]["nodes"]
    return sorted(states, key=lambda s: s["position"])

def find_state_by_type(states: list[dict], state_type: str) -> Optional[dict]:
    """Find the first state matching the given type."""
    return next((s for s in states if s["type"] == state_type), None)

def transition_issue(issue_id: str, target_state_type: str) -> dict:
    """Transition an issue to the first workflow state of the given type."""

    # First, get the issue's current team
    issue_data = graphql("""
    query IssueTeam($id: String!) {
      issue(id: $id) {
        id
        identifier
        state { name type }
        team { id name }
      }
    }
    """, {"id": issue_id})

    issue = issue_data["issue"]
    team_id = issue["team"]["id"]

    print(f"Issue {issue['identifier']} currently in: {issue['state']['name']}")

    # Get team's workflow states
    states = get_team_states(team_id)
    target_state = find_state_by_type(states, target_state_type)

    if not target_state:
        raise ValueError(f"No state of type '{target_state_type}' found in team")

    # Perform the transition
    result = graphql("""
    mutation TransitionIssue($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
        issue {
          id
          identifier
          state { id name type }
        }
      }
    }
    """, {"id": issue_id, "stateId": target_state["id"]})

    updated = result["issueUpdate"]["issue"]
    print(f"Transitioned to: {updated['state']['name']}")
    return updated

# Usage
transition_issue("ENG-42", "started")   # Move to In Progress
transition_issue("ENG-42", "completed") # Move to Done
```

### Example 3: Get All My Assigned Issues

```python
import requests
import os

def get_my_issues(api_key: str) -> list[dict]:
    url = "https://api.linear.app/graphql"
    headers = {
        "Content-Type": "application/json",
        "Authorization": api_key
    }

    query = """
    query MyIssues($after: String) {
      viewer {
        assignedIssues(
          first: 50
          after: $after
          orderBy: updatedAt
          filter: {
            state: { type: { nin: ["completed", "canceled"] } }
          }
        ) {
          nodes {
            id
            identifier
            title
            priority
            priorityLabel
            state {
              name
              type
            }
            team {
              name
              key
            }
            dueDate
            url
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
    """

    all_issues = []
    cursor = None

    while True:
        variables = {"after": cursor} if cursor else {}
        response = requests.post(
            url,
            json={"query": query, "variables": variables},
            headers=headers
        )
        data = response.json()["data"]["viewer"]["assignedIssues"]
        all_issues.extend(data["nodes"])

        if not data["pageInfo"]["hasNextPage"]:
            break
        cursor = data["pageInfo"]["endCursor"]

    return all_issues

issues = get_my_issues(os.environ["LINEAR_API_KEY"])
for issue in issues:
    print(f"[{issue['team']['key']}] {issue['identifier']}: {issue['title']} — {issue['state']['name']} ({issue['priorityLabel']})")
```

### Example 4: Add a Comment with Mentions

```python
import requests
import os

def add_comment(api_key: str, issue_id: str, body: str) -> dict:
    url = "https://api.linear.app/graphql"
    headers = {
        "Content-Type": "application/json",
        "Authorization": api_key
    }

    mutation = """
    mutation AddComment($issueId: String!, $body: String!) {
      commentCreate(input: {
        issueId: $issueId
        body: $body
      }) {
        success
        comment {
          id
          body
          createdAt
          user {
            name
          }
        }
      }
    }
    """

    response = requests.post(
        url,
        json={
            "query": mutation,
            "variables": {"issueId": issue_id, "body": body}
        },
        headers=headers
    )

    result = response.json()["data"]["commentCreate"]
    if result["success"]:
        comment = result["comment"]
        print(f"Comment added by {comment['user']['name']} at {comment['createdAt']}")

    return result

# Comments support Markdown
add_comment(
    os.environ["LINEAR_API_KEY"],
    "ENG-42",
    "**Investigation complete**\n\nRoot cause identified in `auth/login.ts:47`.\n\nPR: https://github.com/example/repo/pull/123"
)
```

---

## 17. Resources and Further Reading

### Official Documentation

- [Linear Developers Portal](https://linear.app/developers) — Main entry point for all developer documentation
- [GraphQL API Getting Started](https://linear.app/developers/graphql) — Endpoint, auth, first queries
- [Filtering Guide](https://linear.app/developers/filtering) — All filter operators and examples
- [Pagination Guide](https://linear.app/developers/pagination) — Cursor-based pagination details
- [Rate Limiting Guide](https://linear.app/developers/rate-limiting) — Complexity and request limits
- [OAuth 2.0 Authentication](https://linear.app/developers/oauth-2-0-authentication) — Multi-user OAuth flow
- [Webhooks Guide](https://linear.app/developers/webhooks) — Real-time push notifications
- [Attachments Guide](https://linear.app/developers/attachments) — Linking external resources
- [Advanced API Usage](https://linear.app/developers/advanced-usage) — Advanced patterns

### TypeScript SDK

- [SDK Getting Started](https://linear.app/developers/sdk) — Installation and initialization
- [SDK Fetching & Modifying Data](https://linear.app/developers/sdk-fetching-and-modifying-data) — Complete SDK examples
- [@linear/sdk on npm](https://www.npmjs.com/package/@linear/sdk) — Package page
- [Linear GitHub Repository](https://github.com/linear/linear) — Source code, SDK, schema

### Schema Reference

- [Apollo Studio — Linear API Graph](https://studio.apollographql.com/public/Linear-API/schema/reference?variant=current) — Browse and query the full schema
- [Linear GraphQL Schema (GitHub)](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql) — Raw .graphql schema file

### Community and Guides

- [Building a Linear CLI (blog post)](https://medium.com/hacksnextdoor/building-my-first-cli-on-top-of-linear-using-graphql-619d5be7deab) — Real-world CLI example
- [Create/Update Issues with Python (Endgrate)](https://endgrate.com/blog/how-to-create-or-update-issues-with-the-linear-api-in-python) — Python implementation guide
- [Get Issues with JavaScript (Endgrate)](https://endgrate.com/blog/using-the-linear-api-to-get-issues-(with-javascript-examples)) — JavaScript examples
- [Linear API Integration Guide (Rollout)](https://rollout.com/integration-guides/linear/api-essentials) — API essentials overview
- [Linear Webhooks Complete Guide (Inventive HQ)](https://inventivehq.com/blog/linear-webhooks-guide) — Detailed webhook payload examples

---

*Document compiled February 27, 2026. Linear API information based on official documentation and community resources as of early 2026. Always verify against the official Linear developer documentation at [linear.app/developers](https://linear.app/developers) for the latest schema and API changes.*
