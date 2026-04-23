# Sessions & Interaction Modes

## What are sessions

A session is a persistent conversation with a coding agent within a workspace. Each session has:

- Full message history
- Current interaction mode
- Associated plan (optional)
- Execution phase (idle, planning, reviewing, executing)

Sessions are stored in SQLite and maintained between app restarts.

## Interaction modes

Arandu supports six interaction modes with the agent:

### ask
Conversational mode for general questions. Ideal for:
- Exploring the codebase
- Understanding architectural decisions
- Getting technical answers

### plan
Generates a structured plan document. The plan is saved as a Markdown file and displayed in Arandu for review. Ideal for:
- Planning new features
- Creating implementation roadmaps
- Defining architecture

### code
Generates or modifies code. The agent has access to the project context and can:
- Create new files
- Modify existing code
- Refactor

### edit
Applies targeted, surgical edits to files. More precise than `code` mode for specific changes.

### agent
Autonomous multi-step execution. The agent decides the actions needed to complete the task.

### autopilot
Fully automated execution. The agent completes the task without requesting intermediate confirmations.

::: warning
Use `agent` and `autopilot` modes with care — they can make sweeping modifications to your project.
:::

## Response streaming

Agent responses are streamed in real time, with support for cancellation at any time.

## Creating a session

1. Open a workspace
2. Click **New Session**
3. Select the initial mode
4. Type your first prompt

## Switching between sessions

Use the workspace sidebar to navigate between existing sessions. Each session is identified by a name and creation date.
