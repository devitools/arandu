# Workspace

A Workspace is a project directory connected to a coding agent via ACP (Agent Communication Protocol).

## What is a Workspace

When you open a folder in Arandu as a workspace, you're creating a work context where:

1. **Sessions** are linked to the project directory
2. **An agent** (e.g., GitHub Copilot CLI) is connected via ACP
3. **Plans** are generated, reviewed, and executed within that context

## Opening a Workspace

1. On the home screen, click **Open Workspace**
2. Select the project directory
3. Click **Connect** to start a session with the agent

Or via CLI:

```bash
arandu /path/to/project
```

## How the ACP connection works

Arandu communicates with coding agents via JSON-RPC 2.0 over stdin/stdout:

```
Arandu (frontend) → Tauri (Rust) → github-copilot --acp --stdio
                                         ↑ stdin/stdout
```

The agent needs to support the ACP protocol. Currently, [GitHub Copilot CLI](https://github.com/github/gh-copilot) is the tested and supported agent.

## Session management

Each workspace can have multiple sessions, each with:

- Full message history
- Current interaction mode
- Associated plan (if any)
- Plan phase (idle, planning, reviewing, executing)

Sessions are persisted in SQLite and restored automatically.

## Typical workflow

```
1. Open workspace (project directory)
2. Connect agent
3. Create session
4. Use "ask" mode to explore the context
5. Use "plan" mode to create an implementation plan
6. Review the plan with inline comments
7. Use "code" or "agent" mode to execute
```

## Supported agents

| Agent | Status |
|-------|--------|
| GitHub Copilot CLI | ✅ Supported |
| Other ACP agents | 🔜 Planned |
