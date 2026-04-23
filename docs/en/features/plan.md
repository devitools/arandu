# Plan Workflow

The plan workflow is a structured way to work with AI agents: generate a plan, review it with comments, and only then execute.

## Phases

The plan goes through four phases:

```
idle → planning → reviewing → executing
```

### idle
Initial state. No active plan in the session.

### planning
The agent is generating the plan. The document is written in real time and displayed in Arandu via live reload.

### reviewing
The plan has been generated. You can:
- Read the document in the view panel
- Add comments on specific blocks (`Cmd/Ctrl+Click`)
- See the consolidated review prompt
- Approve or request revisions

### executing
The plan has been approved. The agent is executing the changes.

## Plan file

The plan is saved as a Markdown file in:
```
~/.local/share/arandu/plans/{session_id}.md
```

You can open this file directly in Arandu for detailed review.

## Commenting on the plan

During the **reviewing** phase, use `Cmd/Ctrl+Click` on any plan block to add a comment. Comments are aggregated into a review prompt that can be sent back to the agent.

## Approving and executing

After reviewing:
1. Click **Approve Plan** to advance to the `executing` phase
2. The agent receives the approval signal and begins execution
3. Track progress in the session

## Rejecting and revising

If the plan needs improvement:
1. Add comments on the problematic blocks
2. Click **Request Revision** to send the review prompt to the agent
3. The agent generates a revised version
4. The workflow returns to the `reviewing` phase
