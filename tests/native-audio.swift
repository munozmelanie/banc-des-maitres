import Foundation

@main struct NativeAudioTests {
    static func main() {
        var checks = 0
        func check(_ condition: @autoclosure () -> Bool, _ message: String) {
            precondition(condition(), message)
            checks += 1
        }
        var gate = FluenceAudioGate()
        func begin(_ id: String, now: Double = 10_000, received: Double = 10_000,
                   deadline: Double = 10_400, duration: Double = 0.18, active: Bool = true) -> Bool {
            gate.begin(id: id, duration: duration, deadline: deadline,
                       receivedAt: received, now: now, active: active)
        }
        check(!begin(""), "Identifiant obligatoire")
        check(!begin(String(repeating: "x", count: 129)), "Identifiant borné")
        check(!begin("bad-duration", duration: .infinity), "Durée finie")
        check(!begin("long", duration: 1.01), "Durée maximale")
        check(!begin("short", duration: 0.049), "Durée minimale")
        check(!begin("nan", deadline: .nan), "Échéance finie")
        check(!begin("late", deadline: 10_000), "Pas de bip tardif")
        check(!begin("distant", deadline: 11_001), "Pas de programmation lointaine")
        check(!begin("hidden", active: false), "Pas de bip en arrière-plan/interruption")
        check(!gate.stop(id: "cancelled"), "Arrêt préalable idempotent")
        check(!begin("cancelled"), "Arrêt préalable empêche play")
        check(begin("first"), "Premier bip")
        check(!begin("first"), "Pas de doublon")
        check(gate.ready(id: "first", deadline: 10_400, now: 10_100, active: true), "Prêt avant échéance")
        check(!gate.ready(id: "first", deadline: 10_400, now: 10_400, active: true), "Préparation trop lente rejetée")
        check(!gate.ready(id: "first", deadline: 10_400, now: 10_100, active: false), "Changement de cycle rejeté")
        check(begin("second"), "Nouveau bip remplace le précédent")
        check(!gate.stop(id: "first") && gate.currentID == "second", "Ancien stop ne coupe pas le nouveau")
        gate.finish(id: "first")
        check(gate.currentID == "second", "Ancienne fin ne coupe pas le nouveau")
        check(gate.stop(id: "second") && gate.currentID == nil, "Stop courant")
        check(!gate.stop(id: "second"), "Double stop")
        check(begin("before-interruption"), "Bip avant interruption")
        gate.invalidate(now: 10_010)
        check(gate.currentID == nil, "Interruption arrête le signal")
        check(!begin("queued", now: 10_020, received: 10_000), "Appel déjà en file invalidé")
        check(begin("after-interruption", now: 10_020, received: 10_020), "Nouveau geste après interruption")
        gate.finish(id: "after-interruption")
        check(gate.currentID == nil, "Fin normale nettoyée")
        var allRepeated = true
        for cycle in 0..<100 {
            for number in 0..<3 {
                let id = "cycle-\(cycle)-\(number)"
                allRepeated = begin(id, now: 10_100, received: 10_100) && allRepeated
                allRepeated = gate.stop(id: id) && allRepeated
            }
        }
        check(allRepeated, "100 décomptes sans accumulation ni blocage")
        check(gate.rememberedCount == 256, "Historique d'annulation borné")
        check(!begin("cycle-99-2", now: 10_100, received: 10_100), "Dernier identifiant toujours protégé")

        for duration in [0.18, 0.6] {
            let wav = [UInt8](FluenceAudioTone.wav(duration: duration))
            func word(_ index: Int) -> UInt16 { UInt16(wav[index]) | UInt16(wav[index + 1]) << 8 }
            func uint(_ index: Int) -> UInt32 { UInt32(word(index)) | UInt32(word(index + 2)) << 16 }
            let count = Int((duration * 44_100).rounded())
            check(String(bytes: wav[0..<4], encoding: .ascii) == "RIFF" && String(bytes: wav[8..<12], encoding: .ascii) == "WAVE", "WAV RIFF")
            check(wav.count == 44 + count * 2 && uint(4) == wav.count - 8 && uint(40) == count * 2, "Durée et tailles WAV exactes")
            check(word(20) == 1 && word(22) == 1 && word(34) == 16 && uint(24) == 44_100, "PCM mono 16 bits 44,1 kHz")
            let samples = (0..<count).map { Int16(bitPattern: word(44 + $0 * 2)) }
            check(samples.first == 0 && samples.last == 0, "Enveloppe sans saut aux extrémités")
            let peak = samples.map { abs(Int($0)) }.max()!
            check(peak > 8_000 && peak <= 8_192, "Amplitude plafonnée à 0,25")
            let crossings = (1..<count).filter { samples[$0 - 1] <= 0 && samples[$0] > 0 }.count
            check(abs(Double(crossings) / duration - 880) < 6, "Fréquence de 880 Hz")
        }
        print("\(checks) contrôles du son natif réussis.")
    }
}
