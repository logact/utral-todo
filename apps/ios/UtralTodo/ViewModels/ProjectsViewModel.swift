import Foundation

@MainActor
final class ProjectsViewModel: ObservableObject {
    func createProject(title: String, color: String) {
        print("Create project: \(title)")
    }
}
