import SwiftUI
import WebKit

// Pixel Daycare as an iPad app: the daycare (bundled from the web version) runs full screen,
// keeps the screen awake, and stores sprites on the device so it works without a connection.
@main
struct PixelDaycareApp: App {
    var body: some Scene {
        WindowGroup {
            DaycareView()
                .ignoresSafeArea()
                .statusBarHidden()
                .persistentSystemOverlays(.hidden)
                .background(Color(red: 0.11, green: 0.16, blue: 0.13))
                .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        }
    }
}

struct DaycareView: UIViewRepresentable {
    func makeCoordinator() -> Bridge { Bridge() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(context.coordinator.files, forURLScheme: AppFiles.scheme)
        config.userContentController.add(context.coordinator, name: "share")
        config.websiteDataStore = .default()

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.11, green: 0.16, blue: 0.13, alpha: 1)
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        web.isInspectable = true
        #endif
        web.uiDelegate = context.coordinator
        context.coordinator.web = web
        web.load(URLRequest(url: URL(string: "\(AppFiles.scheme)://app/index.html")!))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// Messages from the page: currently just "share this world file".
final class Bridge: NSObject, WKScriptMessageHandler {
    let files = AppFiles()
    weak var web: WKWebView?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "share", let body = message.body as? [String: Any] else { return }
        // A visit link: share it as a link (Messages, Mail, Copy, AirDrop…).
        if let link = body["url"] as? String, let url = URL(string: link), url.scheme == "https" {
            guard let web, let top = topController() else { return }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = web
            sheet.popoverPresentationController?.sourceRect = CGRect(x: web.bounds.midX, y: web.bounds.midY, width: 1, height: 1)
            top.present(sheet, animated: true)
            return
        }
        guard let text = body["text"] as? String else { return }
        let name = (body["name"] as? String).map { ($0 as NSString).lastPathComponent } ?? "daycare-world.json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do { try text.write(to: url, atomically: true, encoding: .utf8) } catch { return }

        guard let web, let top = topController() else { return }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = web
        sheet.popoverPresentationController?.sourceRect = CGRect(x: web.bounds.maxX - 120, y: 40, width: 1, height: 1)
        top.present(sheet, animated: true)
    }

    func topController() -> UIViewController? {
        guard var top = web?.window?.rootViewController else { return nil }
        while let shown = top.presentedViewController { top = shown }
        return top
    }
}

/// The page's alert(), confirm() and prompt() (renaming boxes, confirming deletes) as native iPad dialogs.
extension Bridge: WKUIDelegate {
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        guard let top = topController() else { return completionHandler() }
        top.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        guard let top = topController() else { return completionHandler(false) }
        top.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText; $0.clearButtonMode = .whileEditing }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        guard let top = topController() else { return completionHandler(nil) }
        top.present(alert, animated: true)
    }
}
