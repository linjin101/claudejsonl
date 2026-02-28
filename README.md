# Claude Conversation Viewer

Web viewer for Claude Code conversation logs, inspired by claude-extract.

## Features

- **Full conversation display** - Shows user messages, assistant responses, tool calls, and results
- **Claude-extract style** - Clean card-based UI with color-coded message types
- **Project list sidebar** - Easy navigation between projects
- **Pagination with scroll-to-load** - Automatically loads more as you scroll
- **Search** - Filter projects by name
- **5 themes** - Light, Dark, Blue, Purple, Green
- **Filtered system messages** - Hides task notifications and auto-generated content

## Message Types

| Type | Icon | Color | Description |
|------|------|-------|-------------|
| User | 👤 | Blue | Your inputs to Claude |
| Assistant | 🤖 | Green | Claude's responses |
| Tool Use | 🔧 | Orange | Tool/function calls |
| Tool Result | 📋 | Red | Results from tools |

## Quick Start

Double-click `start.bat` to launch the server, then open http://localhost:3033

## Manual Start

```bash
cd C:/work/qmt/claudejsonl
node server.js
```

## Project Path

Default: `C:\Users\linjin101\.claude\projects`
