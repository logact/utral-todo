import SwiftUI
import UtralTodoKit

struct WatchTimerView: View {
    let todo: Todo
    @State private var elapsedSeconds = 0
    @State private var isRunning = false
    @State private var timer: Timer?

    var formattedTime: String {
        let minutes = elapsedSeconds / 60
        let seconds = elapsedSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    var body: some View {
        VStack(spacing: 16) {
            Text(todo.title)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Text(formattedTime)
                .font(.system(size: 48, weight: .bold, design: .monospaced))
                .foregroundStyle(isRunning ? .green : .primary)

            HStack(spacing: 20) {
                Button(action: resetTimer) {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.title2)
                }
                .buttonStyle(.plain)
                .tint(.red)

                Button(action: toggleTimer) {
                    Image(systemName: isRunning ? "pause.fill" : "play.fill")
                        .font(.title2)
                }
                .buttonStyle(.plain)
                .tint(isRunning ? .orange : .green)
            }

            if !isRunning && elapsedSeconds > 0 {
                Button("Save") {
                    saveTimerSession()
                }
                .buttonStyle(.borderedProminent)
                .tint(.indigo)
            }
        }
        .padding()
        .onDisappear {
            timer?.invalidate()
        }
    }

    private func toggleTimer() {
        if isRunning {
            timer?.invalidate()
            isRunning = false
        } else {
            isRunning = true
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
                elapsedSeconds += 1
            }
        }
    }

    private func resetTimer() {
        timer?.invalidate()
        isRunning = false
        elapsedSeconds = 0
    }

    private func saveTimerSession() {
        // In a real app, save the timer session to SwiftData and queue for sync
        print("Saved timer: \(elapsedSeconds)s for \(todo.title)")
    }
}
