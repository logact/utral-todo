import SwiftUI
import SwiftData
import UtralTodoKit

struct ProjectListView: View {
    @Query(sort: \Project.createdAt, order: .reverse) private var projects: [Project]
    @State private var showAddProject = false
    @State private var newProjectTitle = ""

    var body: some View {
        NavigationStack {
            List {
                ForEach(projects, id: \.id) { project in
                    NavigationLink {
                        ProjectDetailView(project: project)
                    } label: {
                        HStack(spacing: 12) {
                            Circle()
                                .fill(Color(hex: project.color) ?? .indigo)
                                .frame(width: 12, height: 12)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(project.title)
                                    .font(.body)
                                Text(project.status)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Projects")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showAddProject = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .alert("New Project", isPresented: $showAddProject) {
                TextField("Project name", text: $newProjectTitle)
                Button("Cancel", role: .cancel) { }
                Button("Create") {
                    createProject()
                }
            }
        }
    }

    private func createProject() {
        guard !newProjectTitle.isEmpty else { return }
        // In a real app, this would use a ViewModel with ModelContext
        newProjectTitle = ""
    }
}

struct ProjectDetailView: View {
    let project: Project

    @Query private var allTodos: [Todo]

    var projectTodos: [Todo] {
        allTodos.filter { $0.projectId == project.id }.sorted { $0.order < $1.order }
    }

    var body: some View {
        List {
            Section {
                HStack {
                    Circle()
                        .fill(Color(hex: project.color) ?? .indigo)
                        .frame(width: 16, height: 16)
                    Text(project.description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Tasks") {
                ForEach(projectTodos, id: \.id) { todo in
                    TodoRow(todo: todo)
                }
            }
        }
        .navigationTitle(project.title)
    }
}
