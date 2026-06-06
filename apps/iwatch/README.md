# Utral Todo — watchOS

Native watchOS companion app for Utral Todo. Standalone — syncs directly with your Express server, no iPhone required.

The Xcode project that builds this app lives in [`apps/ios/`](../ios/).

## Project Structure

```
apps/iwatch/
└── UtralTodoWatch/            # watchOS app source files
    ├── UtralTodoWatchApp.swift
    └── Views/
        ├── ContentView.swift
        ├── TimerView.swift
        └── TodoDetailView.swift
```

## Quick Start

```bash
cd apps/ios

# If you don't have xcodegen installed:
brew install xcodegen

# Generate the Xcode project
xcodegen generate

# Open in Xcode
open UtralTodo.xcodeproj
```

Then select the **UtralTodoWatch** scheme and run on a watch simulator or device.

## Features

- **Today list**: Minimal view optimized for small screens
- **Quick complete**: Mark tasks done from the watch face
- **Timer**: Built-in timer for Pomodoro/time tracking
- **Standalone**: Syncs directly with server, no iPhone required

## Architecture

```
┌─────────────────┐
│  watchOS App    │
│   (SwiftUI)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  UtralTodoKit   │
│  (shared Swift  │
│   package)      │
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│  Express Server  │
│  (/api/watch/*)  │
│  (/api/sync/*)   │
└──────────────────┘
```

## Sync Strategy

Same as the iOS and desktop apps:
1. **Local source of truth**: SwiftData models stored on device
2. **Outbound changes**: Queued locally, pushed via `POST /api/sync/push`
3. **Inbound changes**: Received via SSE stream (`GET /api/sync/stream`)
4. **Conflict resolution**: Last-write-wins by `updatedAt` timestamp
