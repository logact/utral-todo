import SwiftUI
import WidgetKit
import ActivityKit
import UtralTodoKit

@main
struct UtralTodoWidgetBundle: WidgetBundle {
    var body: some Widget {
        TimerLiveActivity()
    }
}

struct TimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TimerAttributes.self) { context in
            LockScreenLiveActivityView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: context.state.isCompleted ? "checkmark.circle.fill" : "timer")
                            .foregroundColor(context.state.isCompleted ? .green : .white)
                            .font(.title3)
                        Text(context.state.timerName)
                            .font(.headline)
                            .lineLimit(1)
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text("Interval \(context.state.currentIndex + 1)/\(context.state.totalIntervals)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 4) {
                        Text(context.state.formattedRemaining)
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .foregroundColor(context.state.isCompleted ? .green : .white)
                            .contentTransition(.numericText(countsDown: true))
                            .animation(.linear, value: context.state.remainingSeconds)

                        if !context.state.isCompleted {
                            ProgressView(value: context.state.progress)
                                .tint(.indigo)
                                .frame(maxWidth: 120)
                        }
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        if context.state.isCompleted {
                            Label("Completed", systemImage: "checkmark.circle.fill")
                                .font(.caption)
                                .foregroundColor(.green)
                        } else if context.state.isRunning {
                            Label("Running", systemImage: "play.circle.fill")
                                .font(.caption)
                                .foregroundColor(.indigo)
                        } else {
                            Label("Paused", systemImage: "pause.circle.fill")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }

                        Spacer()

                        if context.state.totalIntervals > 1 {
                            Text("\(context.state.currentIndex + 1) of \(context.state.totalIntervals)")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.isCompleted ? "checkmark.circle.fill" : "timer")
                    .foregroundColor(context.state.isCompleted ? .green : .white)
            } compactTrailing: {
                Text(context.state.formattedRemaining)
                    .font(.caption2)
                    .monospacedDigit()
            } minimal: {
                Image(systemName: context.state.isCompleted ? "checkmark.circle.fill" : "timer")
            }
        }
    }
}

struct LockScreenLiveActivityView: View {
    let context: ActivityViewContext<TimerAttributes>

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(context.state.timerName)
                    .font(.headline)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    if context.state.isCompleted {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Completed")
                            .foregroundColor(.green)
                    } else if context.state.isRunning {
                        Image(systemName: "play.circle.fill")
                            .foregroundColor(.indigo)
                        Text("Interval \(context.state.currentIndex + 1)/\(context.state.totalIntervals)")
                    } else {
                        Image(systemName: "pause.circle.fill")
                            .foregroundColor(.orange)
                        Text("Paused")
                    }
                }
                .font(.caption)
                .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(context.state.formattedRemaining)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(context.state.isCompleted ? .green : .white)
                    .contentTransition(.numericText(countsDown: true))

                if !context.state.isCompleted && context.state.intervalDuration > 0 {
                    ProgressView(value: context.state.progress)
                        .tint(context.state.isRunning ? .indigo : .orange)
                        .frame(width: 80)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
