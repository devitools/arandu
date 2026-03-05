# Introduction

**Arandu** <span class="pronunciation"><span class="ipa">/a.ɾan.ˈdu/</span></span> is a Markdown viewer and AI workspace for macOS, Linux, and Windows. The name comes from Guarani and means *wisdom* — a reflection of its mission: to be a space where you read, think, and create with clarity.

## The three pillars

### 1. Markdown Viewer

Arandu renders GitHub Flavored Markdown with full fidelity: tables, task lists, strikethrough, autolinks, code blocks with syntax highlighting. Open any `.md` file and it's displayed with clean typography and sidebar outline navigation.

### 2. AI Workspace

Connect GitHub Copilot (or another ACP-compatible agent) to a project directory. Work in structured sessions with six interaction modes: **ask**, **plan**, **code**, **edit**, **agent**, and **autopilot**. Review plans with inline comments before executing.

### 3. Review Tool

Use Arandu as your `$EDITOR` when working with coding agents. The agent generates a plan → Arandu opens as editor → you comment on blocks inline → generate a review prompt → feedback to the agent.

## Design philosophy

- **Monochrome**: The interface doesn't compete with the content. Neutral background, clear typography.
- **Reading-focused**: Maximum width, generous spacing, no distractions.
- **Offline-first**: Whisper runs on device. No cloud dependencies.
- **Terminal integration**: CLI, IPC via Unix socket and TCP.

## Prerequisites

- macOS 13+, Linux x86_64, or Windows x86_64
- For the AI workspace: GitHub Copilot CLI installed locally

## Next steps

- [Installation](/en/guide/installation) — how to install via Homebrew or manual download
- [Quick Start](/en/guide/quick-start) — open your first file in 2 minutes
