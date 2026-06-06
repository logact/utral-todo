import SwiftUI
import SwiftData
import UtralTodoKit

struct TodayView: View {
    @StateObject private var viewModel = TodayViewModel()
    @Query(sort: \Todo.scheduledDate) private var todos: [Todo]
    @State private var showQuickCreate = false

    var todayTodos: [Todo] {
        let start = Date().startOfDay
        let end = Date().endOfDay
        return todos.filter { todo in
            guard let scheduled = todo.scheduledDate else { return false }
            return scheduled >= start && scheduled <= end
        }.sorted { $0.order < $1.order }
    }

    var body: some View {
        NavigationStack {
            List {
                if todayTodos.isEmpty {
                    Section {
                        ContentUnavailableView {
                            Label("No todos for today", systemImage: "checkmark.circle")
                        } description: {
                            Text("You're all caught up! Relax or plan ahead.")
                        }
                    }
                } else {
                    Section("Today's Tasks") {
                        ForEach(todayTodos, id: \.id) { todo in
                            NavigationLink(value: todo) {
                                TodoRow(todo: todo)
                            }
                        }
                        .onDelete { indexSet in
                            for index in indexSet {
                                viewModel.delete(todo: todayTodos[index])
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Today")
            .navigationDestination(for: Todo.self) { todo in
                TodoDetailView(todo: todo)
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showQuickCreate = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showQuickCreate) {
                QuickCreateView { title in
                    viewModel.quickCreate(title: title)
                }
            }
            .refreshable {
                await viewModel.refresh()
            }
        }
    }
}
