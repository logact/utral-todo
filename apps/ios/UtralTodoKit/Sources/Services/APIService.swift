import Foundation

public enum APIError: Error {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int, message: String?)
    case decodingError(Error)
    case networkError(Error)
}

public actor APIService {
    public var baseURL: String
    public var apiToken: String?
    public var deviceId: String

    private let session: URLSession

    public init(baseURL: String = "", apiToken: String? = nil, deviceId: String) {
        self.baseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.apiToken = apiToken
        self.deviceId = deviceId

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
    }

    private func makeRequest(path: String, method: String, body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: "\(baseURL)/api\(path)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        if let token = apiToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode >= 400 {
            let message = String(data: data, encoding: .utf8)
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }

        return (data, httpResponse)
    }

    public func get<T: Decodable>(_ path: String) async throws -> T {
        let (data, _) = try await makeRequest(path: path, method: "GET")
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    public func post<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await makeRequest(path: path, method: "POST", body: bodyData)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    public func post(_ path: String, body: Encodable) async throws {
        let bodyData = try JSONEncoder().encode(body)
        _ = try await makeRequest(path: path, method: "POST", body: bodyData)
    }

    public func patch<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await makeRequest(path: path, method: "PATCH", body: bodyData)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    public func delete(_ path: String) async throws {
        _ = try await makeRequest(path: path, method: "DELETE")
    }
}
