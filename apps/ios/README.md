# Utral Todo — iOS & watchOS

Native iOS and watchOS apps for Utral Todo. Both apps are **standalone** and sync directly with your Express server.

## Project Structure

```
apps/ios/
├── UtralTodoKit/              # Shared Swift Package (models + services)
│   ├── Package.swift
│   └── Sources/
│       ├── Models/            # SwiftData models
│       └── Services/          # API client, sync engine
│
├── UtralTodo/                 # iOS app source files
│   ├── UtralTodoApp.swift     # @main entry point
│   ├── Views/                 # SwiftUI views
│   └── ViewModels/            # Observable objects
│
└── UtralTodoWatch/            # watchOS app source files
    ├── UtralTodoWatchApp.swift
    └── Views/
```

## Setup Instructions

### 1. Create the Xcode Project

Open Xcode and create a new project:

1. **iOS App**: File > New > Project > App
   - Name: `UtralTodo`
   - Interface: SwiftUI
   - Language: Swift
   - Target: iOS 17+
   - Include tests: optional

2. **watchOS App**: File > New > Target > watchOS > App
   - Name: `UtralTodoWatch`
   - Interface: SwiftUI
   - Target: watchOS 10+

### 2. Add the Shared Package

1. In Xcode, drag `apps/ios/UtralTodoKit/` into the project navigator
2. Select "Create groups" and add to both targets (UtralTodo and UtralTodoWatch)
3. Or use **File > Add Package Dependencies > Add Local Package** and select `UtralTodoKit/`

### 3. Add Source Files to Targets

**For iOS target (`UtralTodo`):**
- Select all files in `UtralTodo/Views/` → check "UtralTodo" target
- Select all files in `UtralTodo/ViewModels/` → check "UtralTodo" target
- Select `UtralTodo/UtralTodoApp.swift` → check "UtralTodo" target

**For watchOS target (`UtralTodoWatch`):**
- Select all files in `UtralTodoWatch/Views/` → check "UtralTodoWatch" target
- Select `UtralTodoWatch/UtralTodoWatchApp.swift` → check "UtralTodoWatch" target

### 4. Configure Info.plist (iOS)

Add to `UtralTodo/Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>fetch</string>
    <string>remote-notification</string>
</array>
```

### 5. Enable Push Notifications

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list)
2. Create an App ID with "Push Notifications" capability
3. Create an APNs Auth Key (Keys > Create Key > Apple Push Notifications service)
4. Download the `.p8` file and note the Key ID and Team ID

### 6. Configure the Server

Add to `apps/server/.env`:

```
APNS_KEY_ID=your_key_id
APNS_TEAM_ID=your_team_id
APNS_BUNDLE_ID=com.yourcompany.utraltodo
APNS_KEY_PATH=/path/to/AuthKey_XXX.p8
APNS_SANDBOX=true
```

Restart the server after updating `.env`.

## Features

### iOS App
- **Today view**: See scheduled todos with project colors and priorities
- **Inbox**: Quick triage of unscheduled tasks
- **Projects**: Browse and manage project tasks
- **Quick create**: Fast todo entry
- **Settings**: Server URL, API token, device registration, sync toggle
- **Real-time sync**: SSE stream for live updates
- **APNS**: Background sync via push notifications

### watchOS App
- **Today list**: Minimal view optimized for small screens
- **Quick complete**: Mark tasks done from the watch face
- **Timer**: Built-in timer for Pomodoro/time tracking
- **Standalone**: Syncs directly with server, no iPhone required

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   iOS App       │     │  watchOS App    │
│  (SwiftUI)      │     │   (SwiftUI)     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│         UtralTodoKit (shared)           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │ SwiftData│  │ APIService│ │SyncEngine│ │
│  │ Models  │  │  (REST) │  │(SSE+Push)│ │
│  └─────────┘  └─────────┘  └─────────┘ │
└─────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │  Express Server  │
         │  (/api/mobile/*) │
         │  (/api/watch/*)  │
         │  (/api/sync/*)   │
         └──────────────────┘
```

## Sync Strategy

Same as the desktop app:
1. **Local source of truth**: SwiftData models stored on device
2. **Outbound changes**: Queued locally, pushed via `POST /api/sync/push`
3. **Inbound changes**: Received via SSE stream (`GET /api/sync/stream`)
4. **Background**: Silent APNS push triggers sync when app is backgrounded
5. **Conflict resolution**: Last-write-wins by `updatedAt` timestamp

## Customization

To change the app bundle ID, update:
- Xcode project settings for both targets
- `APNS_BUNDLE_ID` in server `.env`
- The `UtralTodoKit/Package.swift` platform requirements if needed
