/**
 * Parses Server-Sent Events (SSE) from the API response.
 * Yields JSON objects for every data line.
 */
export class StreamParser {
    _reader;
    _buffer = "";

    constructor(response) {
        this._reader = response.body.getReader();
    }

    async* [Symbol.asyncIterator]() {
        const decoder = new TextDecoder();

        try {
            while (true) {
                let done, value;

                // Safety: If the network cuts out during the stream (e.g wifi lost),
                // reader.read() will throw a native Error. We catch it here to ensure
                // the iterator yields a simple error object instead of crashing the app.
                try {
                    ({ done, value } = await this._reader.read());
                } catch (e) {
                    yield {
                        error: "network_error",
                        //details: e.message
                        };
                    break;
                }

                if (done) break

                this._buffer += decoder.decode(value, { stream: true });

                const lines = this._buffer.split("\n");
                // Save the last partial line for the next chunk
                this._buffer = lines.pop() || "";

                for (const raw of lines) {
                    const line = raw.trim();
                    if (!line.startsWith("data:")) continue;

                    const jsonStr = line.slice(5).trim();
                    if (!jsonStr) continue;

                    try {
                        yield JSON.parse(jsonStr);
                    } catch {
                        //yield { error: "malformed_stream_chunk" };
                    }
                }
            }
        } finally {
            this._reader.releaseLock();
        }
    }
}
