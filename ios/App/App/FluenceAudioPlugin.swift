import UIKit
import AVFoundation
import Capacitor

@objc(FluenceAudioPlugin)
public class FluenceAudioPlugin: CAPPlugin, CAPBridgedPlugin, AVAudioPlayerDelegate {
    public let identifier = "FluenceAudioPlugin"
    public let jsName = "FluenceAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var gate = FluenceAudioGate()
    private var player: AVAudioPlayer?
    private var observers: [NSObjectProtocol] = []
    private var foreground = false
    private var interrupted = false

    public override func load() {
        foreground = UIApplication.shared.applicationState == .active
        observe(UIApplication.didBecomeActiveNotification) { plugin, _ in plugin.foreground = true }
        observe(UIApplication.willResignActiveNotification) { plugin, _ in
            plugin.foreground = false
            plugin.invalidate()
        }
        observe(UIApplication.didEnterBackgroundNotification) { plugin, _ in
            plugin.foreground = false
            plugin.invalidate()
        }
        observe(AVAudioSession.interruptionNotification) { plugin, notification in
            let kind = (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue
            if kind == AVAudioSession.InterruptionType.ended.rawValue {
                plugin.interrupted = false
            } else {
                plugin.interrupted = true
                plugin.invalidate()
            }
        }
        observe(AVAudioSession.mediaServicesWereLostNotification) { plugin, _ in
            plugin.interrupted = true
            plugin.invalidate()
        }
        observe(AVAudioSession.mediaServicesWereResetNotification) { plugin, _ in
            plugin.invalidate()
            plugin.interrupted = false
        }
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
        player?.stop()
    }

    @objc public func play(_ call: CAPPluginCall) {
        let receivedAt = Self.now()
        guard let id = call.getString("id"), let duration = call.getDouble("duree"),
              let deadline = call.getDouble("avant") else {
            call.reject("Signal sonore invalide.", "INVALID_BEEP")
            return
        }
        // Les appels Capacitor arrivent sur sa file de travail, pas sur la file principale.
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Signal sonore indisponible.", "UNAVAILABLE"); return }
            guard self.gate.begin(id: id, duration: duration, deadline: deadline,
                                  receivedAt: receivedAt, now: Self.now(), active: self.canPlay) else {
                call.reject("Signal sonore annulé ou expiré.", "BEEP_CANCELLED")
                return
            }
            self.stopPlayer()
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
                try session.setActive(true)
                let next = try AVAudioPlayer(data: FluenceAudioTone.wav(duration: duration))
                next.delegate = self
                guard next.prepareToPlay(), self.gate.ready(id: id, deadline: deadline,
                                                           now: Self.now(), active: self.canPlay), next.play() else {
                    next.stop()
                    self.gate.finish(id: id)
                    call.reject("Signal sonore indisponible ou expiré.", "BEEP_UNAVAILABLE")
                    return
                }
                self.player = next
                call.resolve(["joue": true])
            } catch {
                self.gate.finish(id: id)
                call.reject("Impossible de jouer le signal sonore.", "BEEP_UNAVAILABLE")
            }
        }
    }

    @objc public func stop(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), FluenceAudioGate.validID(id) else {
            call.reject("Identifiant du signal sonore invalide.", "INVALID_BEEP")
            return
        }
        DispatchQueue.main.async { [weak self] in
            if let self = self, self.gate.stop(id: id) { self.stopPlayer() }
            call.resolve()
        }
    }

    public func audioPlayerDidFinishPlaying(_ finished: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.player === finished else { return }
            if let id = self.gate.currentID { self.gate.finish(id: id) }
            self.stopPlayer()
        }
    }

    public func audioPlayerDecodeErrorDidOccur(_ failed: AVAudioPlayer, error: Error?) {
        audioPlayerDidFinishPlaying(failed, successfully: false)
    }

    private var canPlay: Bool {
        foreground && !interrupted && UIApplication.shared.applicationState == .active
    }

    private static func now() -> Double { Date().timeIntervalSince1970 * 1_000 }

    private func stopPlayer() {
        player?.stop()
        player?.delegate = nil
        player = nil
        // Ne pas désactiver la session partagée : la voix peut encore être en lecture.
    }

    private func invalidate() {
        gate.invalidate(now: Self.now())
        stopPlayer()
    }

    private func observe(_ name: Notification.Name, handler: @escaping (FluenceAudioPlugin, Notification) -> Void) {
        observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
            if let self = self { handler(self, notification) }
        })
    }
}

class FluenceBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FluenceAudioPlugin())
    }
}
