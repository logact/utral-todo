import SwiftUI
import UtralTodoKit

struct TodoRow: View {
    let todo: Todo

    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 4) {
                Text(todo.title)
                    .font(.body)
                    .strikethrough(todo.isDone)
                    .foregroundStyle(todo.isDone ? .secondary : .primary)

                HStack(spacing: 8) {
                    if let projectColor = todo.projectId {
                        Circle()
                            .fill(Color(hex: projectColor) ?? .gray)
                            .frame(width: 8, height: 8)
                    }

                    if todo.estimatedMinutes > 0 {
                        Label("\(todo.estimatedMinutes)m", systemImage: "clock")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    if let due = todo.dueDate {
                        Text(due.formattedTodoDate())
                            .font(.caption2)
                            .foregroundStyle(due < Date() && !todo.isDone ? .red : .secondary)
                    }
                }
            }

            Spacer()

            // Priority badge
            Text(prioritySymbol)
                .font(.caption)
                .foregroundStyle(priorityColor)
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch todo.status {
        case "done": return .green
        case "in_progress": return .orange
        default: return .gray.opacity(0.5)
        }
    }

    private var prioritySymbol: String {
        switch todo.priority {
        case "high": return "!!!"
        case "medium": return "!!"
        case "low": return "!"
        default: return ""
        }
    }

    private var priorityColor: Color {
        switch todo.priority {
        case "high": return .red
        case "medium": return .orange
        case "low": return .blue
        default: return .gray
        }
    }
}

extension Color {
    init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else { return nil }

        let r = Double((rgb & 0xFF0000) >> 16) / 255.0
        let g = Double((rgb & 0x00FF00) >> 8) / 255.0
        let b = Double(rgb & 0x0000FF) / 255.0

        self.init(red: r, green: g, blue: b)
    }
}
