import UIKit
import Capacitor
import WebKit

/// CodedOK's root view controller. Extends Capacitor's bridge with two small
/// native features the web layer can't do on its own:
///   • Printing / PDF — WKWebView ignores window.print(), so the web app posts
///     to the `codedokPrint` message handler and we present the iOS print
///     sheet (which also offers Save to Files / Share as PDF).
///   • Home Screen quick actions — long-press the app icon (Info.plist
///     UIApplicationShortcutItems). The action is handed to the web app as
///     window.__codedokLaunchAction on a cold start, or via
///     window.CodedokQuickAction(type) when the app is already running.
class MainViewController: CAPBridgeViewController, WKScriptMessageHandler {

    /// Set by AppDelegate when the app is cold-launched from a quick action.
    static var pendingQuickAction: String?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let controller = webView?.configuration.userContentController else { return }
        controller.add(self, name: "codedokPrint")
        if let action = MainViewController.pendingQuickAction, MainViewController.isSafeAction(action) {
            let script = WKUserScript(source: "window.__codedokLaunchAction = '\(action)';",
                                      injectionTime: .atDocumentStart,
                                      forMainFrameOnly: true)
            controller.addUserScript(script)
            MainViewController.pendingQuickAction = nil
        }
    }

    // MARK: Printing

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "codedokPrint", let webView = webView else { return }
        let title = (message.body as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "CodedOK"
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = title
        let printController = UIPrintInteractionController.shared
        printController.printInfo = info
        printController.printFormatter = webView.viewPrintFormatter()
        printController.present(animated: true, completionHandler: nil)
    }

    // MARK: Quick actions

    /// Only plain identifiers reach JavaScript.
    static func isSafeAction(_ action: String) -> Bool {
        return !action.isEmpty && action.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
    }

    func runQuickAction(_ action: String) {
        guard MainViewController.isSafeAction(action) else { return }
        webView?.evaluateJavaScript(
            "window.CodedokQuickAction ? window.CodedokQuickAction('\(action)') : (window.__codedokLaunchAction = '\(action)');",
            completionHandler: nil)
    }
}
