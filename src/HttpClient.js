/**
 * Internal HTTP Client handling retries and exponential backoff.
 */
export class HttpClient {
    _retries;
    _backoffBase;
    _backoffFactor;
    _timeout;

    constructor(options) {
        this._retries = options.retries;
        this._backoffBase = options.backoffBase;
        this._backoffFactor = options.backoffFactor;
        this._timeout = options.timeout;
    }

    async request(resource, options = {}) {
        const { timeout: reqTimeoutOverride, ...fetchOptions } = options;
        const reqTimeout = reqTimeoutOverride || this._timeout;

        for (let attempt = 0; attempt <= this._retries; attempt++) {
            const controller = new AbortController();

            // We schedule an abort. If this fires, 'fetch' will throw an error.
            const timeoutId = setTimeout(() => controller.abort(), reqTimeout);

            try {
                const response = await fetch(resource, {
                    ...fetchOptions,
                    signal: controller.signal
                });

                const isRetryableStatus = (response.status >= 500 && response.status < 600) || response.status === 429;

                // Success or non-retryable error (like 404)
                if (!isRetryableStatus || attempt === this._retries) {
                    return response;
                }

            } catch (err) {
                // Fetch failed. Was it an AbortError?
                const isAbortError = err?.name === "AbortError";

                // Did WE cause the abort (Timeout) or did the browser/user cause it?
                const isOurTimeout = controller.signal.aborted;

                // CASE A: User/Browser manually cancelled (Stop button, etc)
                if (isAbortError && !isOurTimeout) {
                    return { error: "request_aborted" };
                }

                // CASE B: We ran out of retries
                if (attempt === this._retries) {
                    // If it was our timeout logic that caused the error:
                    if (isAbortError && isOurTimeout) {
                        return { error: "timeout" };
                    }
                    // Otherwise it was a DNS/SSL/Network issue
                    return { error: "network_error" };
                }

                // If we have retries left, we simply fall through to the delay loop below.
            } finally {
                clearTimeout(timeoutId);
            }

            // Calculate Delay and Wait before next loop
            const delay = this._backoffBase * (this._backoffFactor ** attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}