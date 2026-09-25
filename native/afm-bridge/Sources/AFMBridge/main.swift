import Foundation

@main
struct AFMBridgeMain {
    static func main() async {
        let writer = NDJSONWriter()
        await writer.log("started; stdin/stdout use versioned NDJSON, logs use stderr")

        let runtime = BridgeRuntime(writer: writer)
        while let line = readLine(strippingNewline: true) {
            await runtime.submit(line: line)
        }
        await runtime.finishInput()
        await writer.log("stopped")
    }
}
