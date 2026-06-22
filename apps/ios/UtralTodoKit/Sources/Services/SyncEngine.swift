import Foundation
import SwiftData
import Combine

@MainActor
public final class SyncEngine: ObservableObject {
    @Published public private(set) var status: SyncStatus = .idle
    @Published public private(set) var lastError: String?
    @Published public private(set) var pendingCount: Int = 0

    private let api: APIService
    private let syncService: SyncService
    private let modelContext: ModelContext
    private var sseTask: Task<Void, Never>?
    private var isOnline = true
    private static let lastSyncAtKey = "syncLastSyncAt"

    public enum SyncStatus: String {
        case idle = "idle"
        case syncing = "syncing"
        case offline = "offline"
        case error = "error"
    }

    public init(api: APIService, modelContext: ModelContext) {
        self.api = api
        self.syncService = SyncService(api: api)
        self.modelContext = modelContext
    }

    public func start() {
        connectSSE()
        Task {
            await catchUpIfNeeded()
            await processQueue()
        }
    }

    public func stop() {
        sseTask?.cancel()
        sseTask = nil
    }

    public func setOnline(_ online: Bool) {
        isOnline = online
        if online {
            status = .idle
            Task {
                await catchUpIfNeeded()
                await processQueue()
            }
        } else {
            status = .offline
        }
    }

    // MARK: - Last Sync Tracking

    private func getLastSyncAt() -> Date? {
        guard let interval = UserDefaults.standard.object(forKey: Self.lastSyncAtKey) as? TimeInterval else {
            return nil
        }
        return Date(timeIntervalSince1970: interval)
    }

    private func setLastSyncAt(_ date: Date) {
        UserDefaults.standard.set(date.timeIntervalSince1970, forKey: Self.lastSyncAtKey)
    }

    // MARK: - Catch-Up Sync

    private func catchUpIfNeeded() async {
        guard let lastSync = getLastSyncAt() else {
            setLastSyncAt(Date())
            return
        }

        do {
            let events = try await syncService.fetchEvents(since: lastSync)
            for event in events {
                await applyRemoteEvent(event)
            }
            if !events.isEmpty {
                setLastSyncAt(Date())
            }
        } catch {
            lastError = "Catch-up fetch failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Outbound Sync

    public func queueLocalChange(table: String, operation: String, recordId: String, payload: [String: Any]? = nil) async {
        let event = SyncEvent(
            table: table,
            operation: operation,
            recordId: recordId,
            payloadData: payload.flatMap { try? JSONSerialization.data(withJSONObject: $0) },
            deviceId: await api.deviceId
        )
        modelContext.insert(event)
        try? modelContext.save()
        await updatePendingCount()

        if isOnline {
            Task { await processQueue() }
        }
    }

    public func processQueue() async {
        guard isOnline else { return }

        let descriptor = FetchDescriptor<SyncEvent>(sortBy: [SortDescriptor(\.createdAt)])
        guard let events = try? modelContext.fetch(descriptor), !events.isEmpty else { return }

        status = .syncing

        let remoteEvents: [RemoteSyncEvent] = events.map { event in
            var enrichedPayload = event.payloadData.flatMap {
                (try? JSONSerialization.jsonObject(with: $0) as? [String: Any]) ?? [:]
            } ?? [:]

            switch event.table {
            case "todo":
                if let todo = try? modelContext.fetch(FetchDescriptor<Todo>(predicate: #Predicate { $0.id == event.recordId })).first {
                    enrichedPayload["versionWall"] = todo.versionWall
                    enrichedPayload["versionCounter"] = todo.versionCounter
                    enrichedPayload["versionNode"] = todo.versionNode
                }
            case "pluse":
                if let pluse = try? modelContext.fetch(FetchDescriptor<Pluse>(predicate: #Predicate { $0.id == event.recordId })).first {
                    enrichedPayload["versionWall"] = pluse.versionWall
                    enrichedPayload["versionCounter"] = pluse.versionCounter
                    enrichedPayload["versionNode"] = pluse.versionNode
                }
            case "timerSession":
                if let session = try? modelContext.fetch(FetchDescriptor<TimerSession>(predicate: #Predicate { $0.id == event.recordId })).first {
                    enrichedPayload["versionWall"] = session.versionWall
                    enrichedPayload["versionCounter"] = session.versionCounter
                    enrichedPayload["versionNode"] = session.versionNode
                }
            case "todoRelation":
                if let relation = try? modelContext.fetch(FetchDescriptor<TodoRelation>(predicate: #Predicate { $0.id == event.recordId })).first {
                    enrichedPayload["versionWall"] = relation.versionWall
                    enrichedPayload["versionCounter"] = relation.versionCounter
                    enrichedPayload["versionNode"] = relation.versionNode
                }
            case "todoLog":
                if let log = try? modelContext.fetch(FetchDescriptor<TodoLog>(predicate: #Predicate { $0.id == event.recordId })).first {
                    enrichedPayload["versionWall"] = log.versionWall
                    enrichedPayload["versionCounter"] = log.versionCounter
                    enrichedPayload["versionNode"] = log.versionNode
                }
            case "actionEdge":
                if let edge = try? modelContext.fetch(FetchDescriptor<ActionEdge>(predicate: #Predicate { $0.id == event.recordId })).first {
                    enrichedPayload["versionWall"] = edge.versionWall
                    enrichedPayload["versionCounter"] = edge.versionCounter
                    enrichedPayload["versionNode"] = edge.versionNode
                }
            default:
                break
            }

            let enrichedData = try? JSONSerialization.data(withJSONObject: enrichedPayload)

            return RemoteSyncEvent(
                id: event.id,
                table: event.table,
                operation: event.operation,
                recordId: event.recordId,
                payload: enrichedData,
                deviceId: event.deviceId,
                createdAt: ISO8601DateFormatter().string(from: event.createdAt)
            )
        }

        do {
            let response = try await syncService.pushChanges(remoteEvents)
            if response.rejected.isEmpty {
                // All accepted, clear queue
                for event in events {
                    modelContext.delete(event)
                }
                try? modelContext.save()
            } else {
                // Remove accepted, keep rejected
                let rejectedIds = Set(response.rejected.map(\.recordId))
                for event in events where !rejectedIds.contains(event.recordId) {
                    modelContext.delete(event)
                }
                try? modelContext.save()
                lastError = "\(response.rejected.count) changes rejected"
            }
            status = isOnline ? .idle : .offline
        } catch {
            status = .error
            lastError = String(describing: error)
        }

        await updatePendingCount()
    }

    private func updatePendingCount() async {
        let descriptor = FetchDescriptor<SyncEvent>()
        pendingCount = (try? modelContext.fetchCount(descriptor)) ?? 0
    }

    // MARK: - Inbound Sync (SSE)

    private func connectSSE() {
        sseTask?.cancel()
        sseTask = Task { [weak self] in
            guard let self else { return }
            await self.streamSSE()
        }
    }

    private func streamSSE() async {
        guard let baseURL = URL(string: await api.baseURL) else { return }

        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: true)
        components?.path = "/api/sync/stream"

        var queryItems = [URLQueryItem(name: "deviceId", value: await api.deviceId)]
        if let token = await api.apiToken {
            queryItems.append(URLQueryItem(name: "token", value: token))
        }
        if let lastSync = getLastSyncAt() {
            queryItems.append(URLQueryItem(name: "since", value: ISO8601DateFormatter().string(from: lastSync)))
        }
        components?.queryItems = queryItems

        guard let url = components?.url else { return }

        let request = URLRequest(url: url)

        do {
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                status = .error
                return
            }

            status = .idle

            var buffer = ""
            for try await byte in bytes {
                let char = Character(UnicodeScalar(byte))
                buffer.append(char)

                if buffer.hasSuffix("\n\n") {
                    await handleSSELine(buffer)
                    buffer = ""
                }
            }
        } catch {
            if Task.isCancelled { return }
            status = .error
            lastError = String(describing: error)
            // Reconnect after delay
            try? await Task.sleep(for: .seconds(5))
            connectSSE()
        }
    }

    private func handleSSELine(_ line: String) async {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("data: ") else { return }

        let jsonString = String(trimmed.dropFirst(6))
        guard let data = jsonString.data(using: .utf8) else { return }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601

            if let delta = try? decoder.decode(SSEDelta.self, from: data) {
                for event in delta.events {
                    await applyRemoteEvent(event)
                }
                if !delta.events.isEmpty {
                    setLastSyncAt(Date())
                }
            } else if let single = try? decoder.decode(SSESingle.self, from: data) {
                await applyRemoteEvent(single.event)
                setLastSyncAt(Date())
            }
        }
    }

    private func applyRemoteEvent(_ event: RemoteSyncEvent) async {
        let recordId = event.recordId
        let table = event.table
        let payload = event.payload

        switch table {
        case "todo":
            await applyTodoEvent(recordId: recordId, operation: event.operation, payload: payload)
        case "pluse":
            await applyPluseEvent(recordId: recordId, operation: event.operation, payload: payload)
        case "timerSession":
            await applyTimerSessionEvent(recordId: recordId, operation: event.operation, payload: payload)
        case "todoRelation":
            await applyTodoRelationEvent(recordId: recordId, operation: event.operation, payload: payload)
        case "todoLog":
            await applyTodoLogEvent(recordId: recordId, operation: event.operation, payload: payload)
        case "actionEdge":
            await applyActionEdgeEvent(recordId: recordId, operation: event.operation, payload: payload)
        default:
            break
        }
    }

    // MARK: - HLC Comparison

    private func shouldAdoptRemote(localWall: Int, localCounter: Int, localNode: String,
                                    remoteWall: Int, remoteCounter: Int, remoteNode: String) -> Bool {
        if remoteWall > localWall { return true }
        if remoteWall < localWall { return false }
        if remoteCounter > localCounter { return true }
        if remoteCounter < localCounter { return false }
        return remoteNode > localNode
    }

    // MARK: - Entity-specific apply helpers

    private func applyTodoEvent(recordId: String, operation: String, payload: Data?) async {
        if operation == "delete" {
            if let todo = try? modelContext.fetch(FetchDescriptor<Todo>(predicate: #Predicate { $0.id == recordId })).first {
                modelContext.delete(todo)
                try? modelContext.save()
            }
            return
        }

        guard let payload,
              let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any] else { return }

        let remoteUpdatedAt = parseDate(json["updatedAt"])
        let remoteVersionWall = json["versionWall"] as? Int ?? 0
        let remoteVersionCounter = json["versionCounter"] as? Int ?? 0
        let remoteVersionNode = json["versionNode"] as? String ?? ""
        let deletedAtWall = json["deletedAtWall"] as? Int
        let deletedAtCounter = json["deletedAtCounter"] as? Int
        let deletedAtNode = json["deletedAtNode"] as? String

        if let todo = try? modelContext.fetch(FetchDescriptor<Todo>(predicate: #Predicate { $0.id == recordId })).first {
            if !shouldAdoptRemote(
                localWall: todo.versionWall, localCounter: todo.versionCounter, localNode: todo.versionNode,
                remoteWall: remoteVersionWall, remoteCounter: remoteVersionCounter, remoteNode: remoteVersionNode
            ) { return }
            if let title = json["title"] as? String { todo.title = title }
            if let desc = json["description"] as? String { todo.desc = desc }
            if let status = json["status"] as? String { todo.status = status }
            if let priority = json["priority"] as? String { todo.priority = priority }
            todo.updatedAt = remoteUpdatedAt ?? Date()
            todo.versionWall = remoteVersionWall
            todo.versionCounter = remoteVersionCounter
            todo.versionNode = remoteVersionNode
            todo.deletedAtWall = deletedAtWall
            todo.deletedAtCounter = deletedAtCounter
            todo.deletedAtNode = deletedAtNode
        } else if operation == "create" || operation == "update" {
            let todo = Todo(
                id: recordId,
                title: (json["title"] as? String) ?? "",
                desc: (json["description"] as? String) ?? "",
                status: (json["status"] as? String) ?? "pending",
                priority: (json["priority"] as? String) ?? "medium",
                versionWall: remoteVersionWall,
                versionCounter: remoteVersionCounter,
                versionNode: remoteVersionNode
            )
            if let updatedAt = remoteUpdatedAt { todo.updatedAt = updatedAt }
            todo.deletedAtWall = deletedAtWall
            todo.deletedAtCounter = deletedAtCounter
            todo.deletedAtNode = deletedAtNode
            modelContext.insert(todo)
        }
        try? modelContext.save()
    }

    private func applyPluseEvent(recordId: String, operation: String, payload: Data?) async {
        if operation == "delete" {
            if let pluse = try? modelContext.fetch(FetchDescriptor<Pluse>(predicate: #Predicate { $0.id == recordId })).first {
                modelContext.delete(pluse)
                try? modelContext.save()
            }
            return
        }

        guard let payload,
              let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any] else { return }

        let remoteUpdatedAt = parseDate(json["updatedAt"])
        let remoteVersionWall = json["versionWall"] as? Int ?? 0
        let remoteVersionCounter = json["versionCounter"] as? Int ?? 0
        let remoteVersionNode = json["versionNode"] as? String ?? ""
        let deletedAtWall = json["deletedAtWall"] as? Int
        let deletedAtCounter = json["deletedAtCounter"] as? Int
        let deletedAtNode = json["deletedAtNode"] as? String

        if let pluse = try? modelContext.fetch(FetchDescriptor<Pluse>(predicate: #Predicate { $0.id == recordId })).first {
            if !shouldAdoptRemote(
                localWall: pluse.versionWall, localCounter: pluse.versionCounter, localNode: pluse.versionNode,
                remoteWall: remoteVersionWall, remoteCounter: remoteVersionCounter, remoteNode: remoteVersionNode
            ) { return }
            if let name = json["name"] as? String { pluse.name = name }
            if let desc = json["description"] as? String { pluse.desc = desc }
            if let repeatCount = json["repeatCount"] as? Int { pluse.repeatCount = repeatCount }
            if let autoAdvance = json["autoAdvance"] as? Bool { pluse.autoAdvance = autoAdvance }
            if let intervals = json["intervals"] as? [Int] {
                pluse.intervalsData = (try? JSONEncoder().encode(intervals)) ?? Data()
            }
            if let intervalTodos = json["intervalTodos"] as? [String: String] {
                var dict: [Int: String] = [:]
                for (key, value) in intervalTodos { if let idx = Int(key) { dict[idx] = value } }
                pluse.intervalTodosData = try? JSONEncoder().encode(dict)
            }
            pluse.updatedAt = remoteUpdatedAt ?? Date()
            pluse.versionWall = remoteVersionWall
            pluse.versionCounter = remoteVersionCounter
            pluse.versionNode = remoteVersionNode
            pluse.deletedAtWall = deletedAtWall
            pluse.deletedAtCounter = deletedAtCounter
            pluse.deletedAtNode = deletedAtNode
        } else if operation == "create" || operation == "update" {
            let intervals = (json["intervals"] as? [Int]) ?? [25]
            var intervalTodos: [Int: String]?
            if let dict = json["intervalTodos"] as? [String: String] {
                intervalTodos = [:]
                for (key, value) in dict { if let idx = Int(key) { intervalTodos?[idx] = value } }
            }
            let pluse = Pluse(
                id: recordId,
                name: (json["name"] as? String) ?? "",
                description: (json["description"] as? String) ?? "",
                intervals: intervals,
                repeatCount: (json["repeatCount"] as? Int) ?? 1,
                intervalTodos: intervalTodos,
                autoAdvance: (json["autoAdvance"] as? Bool) ?? true,
                versionWall: remoteVersionWall,
                versionCounter: remoteVersionCounter,
                versionNode: remoteVersionNode
            )
            if let updatedAt = remoteUpdatedAt { pluse.updatedAt = updatedAt }
            pluse.deletedAtWall = deletedAtWall
            pluse.deletedAtCounter = deletedAtCounter
            pluse.deletedAtNode = deletedAtNode
            modelContext.insert(pluse)
        }
        try? modelContext.save()
    }

    private func applyTimerSessionEvent(recordId: String, operation: String, payload: Data?) async {
        if operation == "delete" {
            if let session = try? modelContext.fetch(FetchDescriptor<TimerSession>(predicate: #Predicate { $0.id == recordId })).first {
                modelContext.delete(session)
                try? modelContext.save()
            }
            return
        }

        guard let payload,
              let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any] else { return }

        let remoteUpdatedAt = parseDate(json["updatedAt"])
        let remoteVersionWall = json["versionWall"] as? Int ?? 0
        let remoteVersionCounter = json["versionCounter"] as? Int ?? 0
        let remoteVersionNode = json["versionNode"] as? String ?? ""
        let deletedAtWall = json["deletedAtWall"] as? Int
        let deletedAtCounter = json["deletedAtCounter"] as? Int
        let deletedAtNode = json["deletedAtNode"] as? String

        if let session = try? modelContext.fetch(FetchDescriptor<TimerSession>(predicate: #Predicate { $0.id == recordId })).first {
            if !shouldAdoptRemote(
                localWall: session.versionWall, localCounter: session.versionCounter, localNode: session.versionNode,
                remoteWall: remoteVersionWall, remoteCounter: remoteVersionCounter, remoteNode: remoteVersionNode
            ) { return }
            if let name = json["name"] as? String { session.name = name }
            if let type = json["type"] as? String { session.type = type }
            if let status = json["status"] as? String { session.status = status }
            if let pluseId = json["pluseId"] as? String { session.pluseId = pluseId }
            if let todoId = json["todoId"] as? String { session.todoId = todoId }
            if let repeatCount = json["repeatCount"] as? Int { session.repeatCount = repeatCount }
            if let currentIndex = json["currentIndex"] as? Int { session.currentIndex = currentIndex }
            if let elapsedSeconds = json["elapsedSeconds"] as? Int { session.elapsedSeconds = elapsedSeconds }
            if let intervals = json["intervals"] as? [Int] {
                session.intervalsData = (try? JSONEncoder().encode(intervals))
            }
            if let startedAt = parseDate(json["startedAt"]) { session.startedAt = startedAt }
            if let pausedAt = parseDate(json["pausedAt"]) { session.pausedAt = pausedAt }
            if let completedAt = parseDate(json["completedAt"]) { session.completedAt = completedAt }
            session.updatedAt = remoteUpdatedAt ?? Date()
            session.versionWall = remoteVersionWall
            session.versionCounter = remoteVersionCounter
            session.versionNode = remoteVersionNode
            session.deletedAtWall = deletedAtWall
            session.deletedAtCounter = deletedAtCounter
            session.deletedAtNode = deletedAtNode
        } else if operation == "create" || operation == "update" {
            let intervals = (json["intervals"] as? [Int])
            let session = TimerSession(
                id: recordId,
                type: (json["type"] as? String) ?? "stopwatch",
                name: (json["name"] as? String) ?? "Timer Session",
                pluseId: json["pluseId"] as? String,
                todoId: json["todoId"] as? String,
                intervals: intervals,
                repeatCount: (json["repeatCount"] as? Int) ?? 1,
                startedAt: parseDate(json["startedAt"]) ?? Date(),
                pausedAt: parseDate(json["pausedAt"]),
                completedAt: parseDate(json["completedAt"]),
                currentIndex: (json["currentIndex"] as? Int) ?? 0,
                elapsedSeconds: (json["elapsedSeconds"] as? Int) ?? 0,
                status: (json["status"] as? String) ?? "running",
                versionWall: remoteVersionWall,
                versionCounter: remoteVersionCounter,
                versionNode: remoteVersionNode
            )
            if let updatedAt = remoteUpdatedAt { session.updatedAt = updatedAt }
            session.deletedAtWall = deletedAtWall
            session.deletedAtCounter = deletedAtCounter
            session.deletedAtNode = deletedAtNode
            modelContext.insert(session)
        }
        try? modelContext.save()
    }

    private func applyTodoRelationEvent(recordId: String, operation: String, payload: Data?) async {
        if operation == "delete" {
            if let relation = try? modelContext.fetch(FetchDescriptor<TodoRelation>(predicate: #Predicate { $0.id == recordId })).first {
                modelContext.delete(relation)
                try? modelContext.save()
            }
            return
        }

        guard let payload,
              let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any] else { return }

        let remoteUpdatedAt = parseDate(json["updatedAt"])
        let remoteVersionWall = json["versionWall"] as? Int ?? 0
        let remoteVersionCounter = json["versionCounter"] as? Int ?? 0
        let remoteVersionNode = json["versionNode"] as? String ?? ""
        let deletedAtWall = json["deletedAtWall"] as? Int
        let deletedAtCounter = json["deletedAtCounter"] as? Int
        let deletedAtNode = json["deletedAtNode"] as? String

        if let relation = try? modelContext.fetch(FetchDescriptor<TodoRelation>(predicate: #Predicate { $0.id == recordId })).first {
            if !shouldAdoptRemote(
                localWall: relation.versionWall, localCounter: relation.versionCounter, localNode: relation.versionNode,
                remoteWall: remoteVersionWall, remoteCounter: remoteVersionCounter, remoteNode: remoteVersionNode
            ) { return }
            if let fromTodoId = json["fromTodoId"] as? String { relation.fromTodoId = fromTodoId }
            if let toTodoId = json["toTodoId"] as? String { relation.toTodoId = toTodoId }
            if let type = json["type"] as? String { relation.type = type }
            relation.updatedAt = remoteUpdatedAt ?? Date()
            relation.versionWall = remoteVersionWall
            relation.versionCounter = remoteVersionCounter
            relation.versionNode = remoteVersionNode
            relation.deletedAtWall = deletedAtWall
            relation.deletedAtCounter = deletedAtCounter
            relation.deletedAtNode = deletedAtNode
        } else if operation == "create" || operation == "update" {
            let relation = TodoRelation(
                id: recordId,
                fromTodoId: (json["fromTodoId"] as? String) ?? "",
                toTodoId: (json["toTodoId"] as? String) ?? "",
                type: (json["type"] as? String) ?? "depends_on",
                versionWall: remoteVersionWall,
                versionCounter: remoteVersionCounter,
                versionNode: remoteVersionNode
            )
            if let updatedAt = remoteUpdatedAt { relation.updatedAt = updatedAt }
            relation.deletedAtWall = deletedAtWall
            relation.deletedAtCounter = deletedAtCounter
            relation.deletedAtNode = deletedAtNode
            modelContext.insert(relation)
        }
        try? modelContext.save()
    }

    private func applyTodoLogEvent(recordId: String, operation: String, payload: Data?) async {
        if operation == "delete" {
            if let log = try? modelContext.fetch(FetchDescriptor<TodoLog>(predicate: #Predicate { $0.id == recordId })).first {
                modelContext.delete(log)
                try? modelContext.save()
            }
            return
        }

        guard let payload,
              let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any] else { return }

        let remoteUpdatedAt = parseDate(json["updatedAt"])
        let remoteVersionWall = json["versionWall"] as? Int ?? 0
        let remoteVersionCounter = json["versionCounter"] as? Int ?? 0
        let remoteVersionNode = json["versionNode"] as? String ?? ""
        let deletedAtWall = json["deletedAtWall"] as? Int
        let deletedAtCounter = json["deletedAtCounter"] as? Int
        let deletedAtNode = json["deletedAtNode"] as? String

        if let log = try? modelContext.fetch(FetchDescriptor<TodoLog>(predicate: #Predicate { $0.id == recordId })).first {
            if !shouldAdoptRemote(
                localWall: log.versionWall, localCounter: log.versionCounter, localNode: log.versionNode,
                remoteWall: remoteVersionWall, remoteCounter: remoteVersionCounter, remoteNode: remoteVersionNode
            ) { return }
            if let todoId = json["todoId"] as? String { log.todoId = todoId }
            if let type = json["type"] as? String { log.type = type }
            if let content = json["content"] as? String { log.content = content }
            if let minutesSpent = json["minutesSpent"] as? Int { log.minutesSpent = minutesSpent }
            log.updatedAt = remoteUpdatedAt ?? Date()
            log.versionWall = remoteVersionWall
            log.versionCounter = remoteVersionCounter
            log.versionNode = remoteVersionNode
            log.deletedAtWall = deletedAtWall
            log.deletedAtCounter = deletedAtCounter
            log.deletedAtNode = deletedAtNode
        } else if operation == "create" || operation == "update" {
            let log = TodoLog(
                id: recordId,
                todoId: (json["todoId"] as? String) ?? "",
                type: (json["type"] as? String) ?? "progress",
                content: (json["content"] as? String) ?? "",
                minutesSpent: json["minutesSpent"] as? Int,
                versionWall: remoteVersionWall,
                versionCounter: remoteVersionCounter,
                versionNode: remoteVersionNode
            )
            if let updatedAt = remoteUpdatedAt { log.updatedAt = updatedAt }
            log.deletedAtWall = deletedAtWall
            log.deletedAtCounter = deletedAtCounter
            log.deletedAtNode = deletedAtNode
            modelContext.insert(log)
        }
        try? modelContext.save()
    }

    private func applyActionEdgeEvent(recordId: String, operation: String, payload: Data?) async {
        if operation == "delete" {
            if let edge = try? modelContext.fetch(FetchDescriptor<ActionEdge>(predicate: #Predicate { $0.id == recordId })).first {
                modelContext.delete(edge)
                try? modelContext.save()
            }
            return
        }

        guard let payload,
              let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any] else { return }

        let remoteUpdatedAt = parseDate(json["updatedAt"])
        let remoteVersionWall = json["versionWall"] as? Int ?? 0
        let remoteVersionCounter = json["versionCounter"] as? Int ?? 0
        let remoteVersionNode = json["versionNode"] as? String ?? ""
        let deletedAtWall = json["deletedAtWall"] as? Int
        let deletedAtCounter = json["deletedAtCounter"] as? Int
        let deletedAtNode = json["deletedAtNode"] as? String

        if let edge = try? modelContext.fetch(FetchDescriptor<ActionEdge>(predicate: #Predicate { $0.id == recordId })).first {
            if !shouldAdoptRemote(
                localWall: edge.versionWall, localCounter: edge.versionCounter, localNode: edge.versionNode,
                remoteWall: remoteVersionWall, remoteCounter: remoteVersionCounter, remoteNode: remoteVersionNode
            ) { return }
            if let fromTodoId = json["fromTodoId"] as? String { edge.fromTodoId = fromTodoId }
            if let toTodoId = json["toTodoId"] as? String { edge.toTodoId = toTodoId }
            if let type = json["type"] as? String { edge.type = type }
            edge.updatedAt = remoteUpdatedAt ?? Date()
            edge.versionWall = remoteVersionWall
            edge.versionCounter = remoteVersionCounter
            edge.versionNode = remoteVersionNode
            edge.deletedAtWall = deletedAtWall
            edge.deletedAtCounter = deletedAtCounter
            edge.deletedAtNode = deletedAtNode
        } else if operation == "create" || operation == "update" {
            let edge = ActionEdge(
                id: recordId,
                fromTodoId: (json["fromTodoId"] as? String) ?? "",
                toTodoId: (json["toTodoId"] as? String) ?? "",
                type: (json["type"] as? String) ?? "pre_do",
                versionWall: remoteVersionWall,
                versionCounter: remoteVersionCounter,
                versionNode: remoteVersionNode
            )
            if let updatedAt = remoteUpdatedAt { edge.updatedAt = updatedAt }
            edge.deletedAtWall = deletedAtWall
            edge.deletedAtCounter = deletedAtCounter
            edge.deletedAtNode = deletedAtNode
            modelContext.insert(edge)
        }
        try? modelContext.save()
    }

    private func parseDate(_ value: Any?) -> Date? {
        guard let value else { return nil }
        if let date = value as? Date { return date }
        if let string = value as? String {
            return ISO8601DateFormatter().date(from: string)
        }
        return nil
    }
}

private struct SSEDelta: Decodable {
    let type: String
    let events: [RemoteSyncEvent]
}

private struct SSESingle: Decodable {
    let type: String
    let event: RemoteSyncEvent
}
