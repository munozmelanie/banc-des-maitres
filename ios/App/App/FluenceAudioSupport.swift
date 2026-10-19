import Foundation

// Sans dépendance à UIKit : les annulations et le signal sont testables sur le Mac.
struct FluenceAudioGate {
    private(set) var currentID: String?
    private var remembered = Set<String>()
    private var order: [String] = []
    private var invalidatedAt = -Double.infinity
    private let capacity = 256

    static func validID(_ id: String) -> Bool {
        !id.isEmpty && id.utf8.count <= 128
    }

    mutating func begin(id: String, duration: Double, deadline: Double,
                        receivedAt: Double, now: Double, active: Bool) -> Bool {
        guard Self.validID(id), duration.isFinite, (0.05...1).contains(duration),
              deadline.isFinite, now.isFinite, receivedAt.isFinite,
              deadline > now, deadline <= now + 1_000,
              receivedAt > invalidatedAt, active, !remembered.contains(id) else { return false }
        remember(id)
        currentID = id
        return true
    }

    func ready(id: String, deadline: Double, now: Double, active: Bool) -> Bool {
        currentID == id && active && now.isFinite && deadline > now
    }

    // Une annulation reçue avant play interdit aussi le futur play du même identifiant.
    @discardableResult mutating func stop(id: String) -> Bool {
        guard Self.validID(id) else { return false }
        remember(id)
        guard currentID == id else { return false }
        currentID = nil
        return true
    }

    mutating func finish(id: String) {
        if currentID == id { currentID = nil }
    }

    mutating func invalidate(now: Double) {
        currentID = nil
        invalidatedAt = max(invalidatedAt, now)
    }

    var rememberedCount: Int { remembered.count }

    private mutating func remember(_ id: String) {
        guard remembered.insert(id).inserted else { return }
        order.append(id)
        if order.count > capacity { remembered.remove(order.removeFirst()) }
    }
}

enum FluenceAudioTone {
    static let sampleRate = 44_100

    static func wav(duration: Double) -> Data {
        precondition(duration.isFinite && (0.05...1).contains(duration))
        let count = Int((duration * Double(sampleRate)).rounded())
        let payloadSize = count * 2
        var data = Data(capacity: 44 + payloadSize)
        func text(_ string: String) { data.append(contentsOf: string.utf8) }
        func uint16(_ number: UInt16) {
            data.append(UInt8(number & 255)); data.append(UInt8(number >> 8))
        }
        func uint32(_ number: UInt32) {
            uint16(UInt16(number & 65_535)); uint16(UInt16(number >> 16))
        }
        text("RIFF"); uint32(UInt32(36 + payloadSize)); text("WAVE")
        text("fmt "); uint32(16); uint16(1); uint16(1)
        uint32(UInt32(sampleRate)); uint32(UInt32(sampleRate * 2))
        uint16(2); uint16(16); text("data"); uint32(UInt32(payloadSize))
        let attack = Double(sampleRate) * 0.005
        let release = Double(sampleRate) * 0.025
        for index in 0..<count {
            let envelope = min(1, Double(index) / attack, Double(count - 1 - index) / release)
            let wave = sin(2 * Double.pi * 880 * Double(index) / Double(sampleRate))
            let value = Int16((wave * 0.25 * envelope * Double(Int16.max)).rounded())
            uint16(UInt16(bitPattern: value))
        }
        return data
    }
}
