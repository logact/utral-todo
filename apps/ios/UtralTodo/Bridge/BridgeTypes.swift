import Foundation

struct BridgeMessage: Decodable {
    let id: String
    let module: String
    let action: String
    let params: [String: BridgeValue]?
}

enum BridgeValue: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case object([String: BridgeValue])
    case array([BridgeValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let int = try? container.decode(Int.self) {
            self = .int(int)
        } else if let double = try? container.decode(Double.self) {
            self = .double(double)
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let object = try? container.decode([String: BridgeValue].self) {
            self = .object(object)
        } else if let array = try? container.decode([BridgeValue].self) {
            self = .array(array)
        } else if container.decodeNil() {
            self = .null
        } else {
            throw DecodingError.typeMismatch(
                BridgeValue.self,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Could not decode BridgeValue"
                )
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .double(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

struct BridgeResponse: Encodable {
    let id: String
    let result: BridgeValue?
    let error: BridgeError?

    static func success(id: String, result: BridgeValue) -> BridgeResponse {
        BridgeResponse(id: id, result: result, error: nil)
    }

    static func failure(id: String, code: String, message: String) -> BridgeResponse {
        BridgeResponse(id: id, result: nil, error: BridgeError(code: code, message: message))
    }
}

struct BridgeError: Encodable {
    let code: String
    let message: String
}
