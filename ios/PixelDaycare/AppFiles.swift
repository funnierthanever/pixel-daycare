import Foundation
import WebKit

/// Serves the bundled daycare at daycare://app/… and sprites at daycare://app/sprite/….
/// Sprites are downloaded from PMD SpriteCollab the first time and kept on the iPad after that,
/// so the daycare keeps working offline once each Pokémon has been seen.
final class AppFiles: NSObject, WKURLSchemeHandler {
    static let scheme = "daycare"

    private let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    private let remote = URL(string: "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/")!
    private let cache: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("sprites", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    // WebKit crashes if we answer a request it has already cancelled, so track cancellations.
    private var stopped = Set<ObjectIdentifier>()
    private let lock = NSLock()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let path = url.path.isEmpty || url.path == "/" ? "/index.html" : url.path
        guard !path.contains("..") else { return respond(task, status: 400) }
        if path.hasPrefix("/sprite/") {
            serveSprite(String(path.dropFirst("/sprite/".count)), task)
        } else if let data = try? Data(contentsOf: root.appendingPathComponent(String(path.dropFirst()))) {
            respond(task, status: 200, data: data, type: Self.mime(path))
        } else {
            respond(task, status: 404)
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        lock.lock(); stopped.insert(ObjectIdentifier(task)); lock.unlock()
    }

    private func serveSprite(_ rel: String, _ task: WKURLSchemeTask) {
        let local = cache.appendingPathComponent(rel)
        let missing = local.appendingPathExtension("missing") // remembers sprites that don't exist
        if let data = try? Data(contentsOf: local) { return respond(task, status: 200, data: data, type: Self.mime(rel)) }
        if FileManager.default.fileExists(atPath: missing.path) { return respond(task, status: 404) }

        URLSession.shared.dataTask(with: remote.appendingPathComponent(rel)) { [weak self] data, response, _ in
            guard let self else { return }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 503
            if status == 200, let data {
                try? FileManager.default.createDirectory(at: local.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? data.write(to: local, options: .atomic)
                self.respond(task, status: 200, data: data, type: Self.mime(rel))
            } else {
                if status == 404 {
                    try? FileManager.default.createDirectory(at: missing.deletingLastPathComponent(), withIntermediateDirectories: true)
                    FileManager.default.createFile(atPath: missing.path, contents: nil)
                }
                self.respond(task, status: status == 404 ? 404 : 503)
            }
        }.resume()
    }

    private func respond(_ task: WKURLSchemeTask, status: Int, data: Data = Data(), type: String = "text/plain") {
        let send = { [self] in
            lock.lock(); let gone = stopped.remove(ObjectIdentifier(task)) != nil; lock.unlock()
            if gone { return }
            let headers = ["Content-Type": type, "Content-Length": String(data.count), "Access-Control-Allow-Origin": "*"]
            let response = HTTPURLResponse(url: task.request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        }
        if Thread.isMainThread { send() } else { DispatchQueue.main.async(execute: send) }
    }

    private static func mime(_ path: String) -> String {
        switch (path as NSString).pathExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "json", "webmanifest": return "application/json"
        case "png": return "image/png"
        case "xml": return "application/xml"
        case "css": return "text/css"
        default: return "application/octet-stream"
        }
    }
}
