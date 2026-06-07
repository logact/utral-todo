# Utral Todo — iOS

Native iOS app shell for Utral Todo. Runs the web app inside a WKWebView with a native bridge for platform features.

The watchOS companion lives in [`apps/iwatch/`](../iwatch/).

## Architecture

The iOS app is now a **thin native shell** around the web app:

```
┌─────────────────────────────────────────────┐
│  iOS App (Swift)                            │
│  ┌───────────────────────────────────────┐  │
│  │  WKWebView                            │  │
│  │  ┌───────────────────────────────┐    │  │
│  │  │  Web App (React/Vite)         │    │  │
│  │  │  ┌─────┐ ┌─────┐ ┌─────────┐ │    │  │
│  │  │  │ UI  │ │DB   │ │  Sync   │ │    │  │
│  │  │  │(CSS)│ │(Dexie)│ │(SSE+API)│ │    │  │
│  │  │  └─────┘ └─────┘ └─────────┘ │    │  │
│  │  └───────────────────────────────┘    │  │
│  └───────────────────────────────────────┘  │
│              │                              │
│              ▼                              │
│  ┌───────────────────────────────────────┐  │
│  │  JS ↔ Swift Bridge                    │  │
│  │  • Haptics                            │  │
│  │  • Push Notifications                 │  │
│  │  • Camera (bridge to native picker)   │  │
│  │  • Device info / push token           │  │
│  │  • Keychain storage                   │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
                        │
                        ▼
             ┌──────────────────┐
             │  Express Server  │
             │  (/api/sync/*)   │
             └──────────────────┘
```

**Why a WebView shell?**
- Single codebase: the web app (`apps/mobile/src/`) runs inside the iOS shell
- Fast iteration: develop in the browser with Vite HMR, changes reflect instantly in the simulator
- TypeScript everywhere: no context-switching between Swift and JS
- Native features bridged only where needed (haptics, push, camera)

## Project Structure

```
apps/ios/
├── UtralTodo.xcodeproj/       # Generated Xcode project (run `xcodegen generate` to rebuild)
├── project.yml                # XcodeGen spec — edit this to change project settings
├── UtralTodoKit/              # Shared Swift Package (kept for watchOS companion)
│   └── Sources/
│       ├── Models/            # SwiftData models
│       └── Services/          # API client, sync engine
└── UtralTodo/                 # iOS app source files
    ├── UtralTodoApp.swift     # @main entry point + AppDelegate
    ├── Views/
    │   └── WebShellView.swift # Full-screen WKWebView container
    ├── Bridge/
    │   ├── BridgeTypes.swift      # Message/response types
    │   ├── BridgeModule.swift     # Module protocol
    │   ├── BridgeMessageHandler.swift  # Routes JS → Swift calls
    │   └── BridgeWebView.swift    # UIViewRepresentable WKWebView
    └── NativeModules/
        ├── HapticModule.swift       # UIImpactFeedbackGenerator
        ├── NotificationModule.swift # UNUserNotificationCenter
        ├── CameraModule.swift       # Camera permission bridge
        ├── DeviceModule.swift       # Device info + push token
        ├── StorageModule.swift      # UserDefaults bridge
        └── BridgeModuleError.swift  # Error types
```

## Quick Start

```bash
cd apps/ios

# If you don't have xcodegen installed:
brew install xcodegen

# Generate the Xcode project (only needed if project.yml changes)
xcodegen generate

# Open in Xcode
open UtralTodo.xcodeproj
```

Then select the **UtralTodo** scheme and run on a simulator or device.

### Development mode

The shell loads the web app from `http://localhost:1420` (the Vite dev server) when built in Debug. Start the desktop dev server first:

```bash
pnpm dev:desktop
```

Then run the iOS app in Xcode. Hot reload works — save a file in `apps/mobile/src/` and the iOS app updates automatically.

### Production mode

In Release builds, the shell loads bundled web assets from `www/index.html` in the app bundle. To bundle:

```bash
# Build the web app
pnpm build:mobile

# Copy into the iOS bundle
cp -r apps/mobile/dist/* apps/ios/UtralTodo/www/
```

(You can automate this in a build phase script in Xcode.)

## Bridge Protocol

The web app communicates with native iOS via a JSON message bridge:

**Web → Native:**
```javascript
window.webkit.messageHandlers.bridge.postMessage({
  id: "bridge_1",
  module: "haptic",
  action: "impact",
  params: { style: "medium" }
});
```

**Native → Web (response):**
```javascript
window.__bridge__.resolve("bridge_1", {
  id: "bridge_1",
  result: true,
  error: null
});
```

The bridge is auto-injected into every page load at `documentStart`.

## Using the Bridge from TypeScript

Import from the bridge client in `apps/mobile/src/bridge/native.ts`:

```typescript
import { isNativeShell, nativeHaptic, nativeDevice, nativeNotification } from '@/bridge/native';

// Check if running inside the iOS shell
if (isNativeShell()) {
  // Trigger haptic feedback
  await nativeHaptic.impact('medium');

  // Get device info
  const info = await nativeDevice.getInfo();
  console.log(info.deviceId, info.pushToken);

  // Request push notification permission
  const granted = await nativeNotification.requestPermission();

  // Schedule a local notification
  await nativeNotification.schedule({
    id: 'todo-123',
    title: 'Task due',
    body: 'Review the project plan',
    date: Date.now() + 3600000
  });
}
```

## Available Bridge Modules

| Module | Actions | Description |
|--------|---------|-------------|
| `haptic` | `impact`, `notification`, `selection` | Taptic Engine feedback |
| `notification` | `requestPermission`, `schedule`, `cancel`, `cancelAll` | Local push notifications |
| `camera` | `checkPermission`, `capture`, `pickFromLibrary` | Camera access (delegates to web APIs) |
| `device` | `getInfo`, `getPushToken` | Device metadata + APNS token |
| `storage` | `getItem`, `setItem`, `removeItem`, `getAll` | UserDefaults key-value store |

## Adding a New Native Module

1. Create `UtralTodo/NativeModules/MyModule.swift`:

```swift
import Foundation

struct MyModule: BridgeModule {
    let name = "myModule"

    func handle(action: String, params: [String: BridgeValue]) async throws -> BridgeValue {
        switch action {
        case "doSomething":
            return .string("done")
        default:
            throw BridgeModuleError.unknownAction(action)
        }
    }
}
```

2. Register it in `BridgeMessageHandler.registerModules()`.

3. Add the TypeScript wrapper in `apps/desktop/src/bridge/native.ts`.

## Setup Instructions

### 1. Generate the Xcode project

The project is generated from `project.yml` using [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
cd apps/ios
xcodegen generate
```

If you modify `project.yml` (e.g., add targets, change bundle IDs), regenerate with the same command.

### 2. Enable Push Notifications (optional)

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list)
2. Create an App ID with "Push Notifications" capability
3. Create an APNs Auth Key (Keys > Create Key > Apple Push Notifications service)
4. Download the `.p8` file and note the Key ID and Team ID

### 3. Configure the Server

Add to `apps/server/.env`:

```
APNS_KEY_ID=your_key_id
APNS_TEAM_ID=your_team_id
APNS_BUNDLE_ID=com.utral.UtralTodo
APNS_KEY_PATH=/path/to/AuthKey_XXX.p8
APNS_SANDBOX=true
```

Restart the server after updating `.env`.

## Web App Routing Note

The web app uses `BrowserRouter` by default. In production (loading `file://` URLs), switch to `HashRouter` or ensure your build outputs a single-page app that handles all routes at `index.html`.

## Customization

To change app settings, edit `apps/ios/project.yml` and regenerate:

| Setting | YAML key |
|---------|----------|
| Bundle ID prefix | `options.bundleIdPrefix` |
| iOS deployment target | `targets.UtralTodo.deploymentTarget` |
| Background modes | `targets.UtralTodo.info.properties.UIBackgroundModes` |

After editing, run `xcodegen generate` in `apps/ios/` to rebuild `UtralTodo.xcodeproj`.
