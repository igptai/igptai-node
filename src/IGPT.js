import {HttpClient} from "./HttpClient.js";
import {StreamParser} from "./StreamParser.js";

import pkg from "../package.json";

const CLIENT_NAME = pkg.name;
const CLIENT_VERSION = pkg.version;

const DEFAULT_TIMEOUT_MS = 60_000;          // connect + response
const DEFAULT_STREAM_TIMEOUT_MS = 10 * 60_000; // 10 minutes

/**
 * @typedef {Object} IGPTLoginOptions
 * @property {string} apiKey - (Required) Your iGPT API Key.
 * @property {string} [user] - (Optional) Default User ID. If set, you don't need to pass 'user' in every method call.
 * @property {string} [baseUrl] - (Optional) API Base URL override (default: https://api.igpt.ai/v1).
 * @property {number} [retries] - (Optional) Number of retry attempts on network failure (default: 3).
 * @property {number} [backoffBase] - (Optional) Initial retry delay in ms (default: 100).
 * @property {number} [backoffFactor] - (Optional) Exponential backoff factor (default: 2).
 */

/**
 * @typedef {Object} AskParams
 * @property {string} input - (Required) The question or prompt to ask.
 * @property {string} [user] - (Required if not set in constructor) Unique user identifier.
 * @property {boolean} [stream] - (Optional) If true, returns an async iterable stream.
 * @property {string} [quality] - (Optional) Context engineering quality (e.g., "cef-1-normal").
 * @property {string} [output_format] - (Optional) Output format: "text" (default), "json", or schema.
 */

/**
 * @typedef {Object} SearchParams
 * @property {string} [query] - (Optional) The search query to execute.
 * @property {string} [user] - (Required if not set in constructor) Unique user identifier.
 * @property {string} [date_from] - (Optional) Filter by start date (YYYY-MM-DD).
 * @property {string} [date_to] - (Optional) Filter by end date (YYYY-MM-DD).
 * @property {number} [max_results] - (Optional) Limit number of results (e.g. 50).
 */

/**
 * @typedef {Object} AuthorizeParams
 * @property {string} service - (Required) The service provider (e.g., "spike").
 * @property {string} scope - (Required) Space delimited scopes (e.g., "messages").
 * @property {string} [user] - (Required if not set in constructor) Unique user identifier.
 * @property {string} [redirect_uri] - (Optional) Redirect after successful authorization flow.
 * @property {string} [state] - (Optional) Any value that your application uses to maintain state.
 */

/**
 * @typedef {Object} DisconnectParams
 * @property {string} id - (Required) Datasource ID to disconnect (e.g., "service/id/type").
 * @property {string} [user] - (Required if not set in constructor) Unique user identifier.
 */

/**
 * Service for Recall operations (Ask, Search).
 * @typedef {Object} RecallService
 * @property {(params: AskParams) => Promise<any|StreamParser>} ask - Generate a response based on input and context.
 * @property {(params: SearchParams) => Promise<any>} search - Search connected datasources.
 */

/**
 * Service for managing Datasources.
 * @typedef {Object} DatasourcesService
 * @property {(params: { user?: string }) => Promise<any>} list - List user datasources and their indexing status.
 * @property {(params: DisconnectParams) => Promise<any>} disconnect - Disconnect datasource and remove index data.
 */

/**
 * Service for Connectors (Authorization).
 * @typedef {Object} ConnectorsService
 * @property {(params: AuthorizeParams) => Promise<any>} authorize - Authorize, connect and start indexing a new datasource.
 */

/**
 * SDK Client
 */
export default class IGPT {
    /** @type {RecallService} */
    recall;
    /** @type {DatasourcesService} */
    datasources;
    /** @type {ConnectorsService} */
    connectors;

    /** @private */
    _apiKey;
    /** @private */
    _baseUrl;
    /** @private */
    _http;
    /** @private */
    _user;
    /** @private */
    _timeout;
    /** @private */
    _streamTimeout;

    /**
     * Initialize the iGPT SDK.
     * @param {IGPTLoginOptions} options
     */
    constructor(options) {
        this._apiKey = options.apiKey;
        this._baseUrl = options.baseUrl || "https://api.igpt.ai/v1";
        this._user = options.user;

        this._timeout = DEFAULT_TIMEOUT_MS;
        this._streamTimeout = DEFAULT_STREAM_TIMEOUT_MS;

        this._http = new HttpClient({
            retries: options.retries || 3,
            backoffBase: options.backoffBase || 100,
            backoffFactor: options.backoffFactor || 2,
            timeout: this._timeout
        });

        // Initialize dynamic services
        this.recall = /** @type {RecallService} */ this._createService("/recall", ["ask", "search"]);
        this.datasources = /** @type {DatasourcesService} */ this._createService("/datasources", ["list", "disconnect"]);
        this.connectors = /** @type {ConnectorsService} */ this._createService("/connectors", ["authorize"]);
    }

    /**
     * @private
     * @param {string} endpoint - The base path for the service (e.g. "/recall")
     * @param {string[]} [allowedMethods] - List of allowed method names
     */
    _createService(endpoint, allowedMethods = []) {
        const allowSet = new Set(allowedMethods);
        const hasRestrictions = allowSet.size > 0;

        return new Proxy({}, {
            get: (_, methodName) => {
                // Safety: Avoid blocking internal promises or symbols
                if (methodName === "then") return undefined;

                // If restrictions exist and the method is not in the set, return undefined.
                // This results in "client.service.typo is not a function" and avoids the network call.
                if (hasRestrictions && typeof methodName === "string" && !allowSet.has(methodName)) {
                    return undefined;
                }

                return async (args = {}) => {
                    const path = `${endpoint}/${String(methodName)}`;

                    // Merge default user logic
                    const body = { ...args };
                    if (this._user && !body.user) {
                        body.user = this._user;
                    }

                    if (body?.stream === true) {
                        const res = await this._execute(path, { body });
                        return res?.error ? res : new StreamParser(res);
                    }

                    return this._postJson(path, body);
                };
            }
        });
    }

    /** @private */
    async _postJson(path, body) {
        const res = await this._execute(path, { body} );

        // Check if HttpClient returned a network error object
        if (res?.error) return res;

        // Since server always returns 200, we just parse.
        // If JSON parse fails catch it.
        try {
            return await res.json();
        } catch {
            return { error: "invalid_json_response" };
        }
    }

    /** @private */
    _buildUrl(path) {
        const base = this._baseUrl.replace(/\/+$/, "");
        const clean = path.replace(/^\/+/, "");
        return `${base}/${clean}`;
    }

    /** @private */
    async _execute(path, options = {}) {
        const { method, headers, body } = options;
        const url = this._buildUrl(path);

        const isPlainObject =
            body != null &&
            typeof body === "object" &&
            body.constructor === Object;

        const isStream = body?.stream === true;

        return this._http.request(url, {
            ...options,
            method: method || "POST",
            timeout: isStream ? this._streamTimeout : this._timeout,
            headers: {
                "Authorization": `Bearer ${this._apiKey}`,
                ...(isPlainObject ? { "Content-Type": "application/json" } : {}),
                'X-Client': `${CLIENT_NAME}/${CLIENT_VERSION}`,
                ...headers
            },
            body: isPlainObject ? JSON.stringify(body) : body
        });
    }
}
