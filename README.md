# iGPT Node.js SDK

Official Node.js SDK for the iGPT API.

- Website: https://www.igpt.ai
- Documentation: https://docs.igpt.ai
- Playground: https://igpt.ai/hub/playground/

## Requirements

- Node.js **>= 18**

## Install

```bash
npm install igptai
```

## Authentication

All requests use a Bearer token:

* Header: `Authorization: Bearer <IGPT_API_KEY>`

Store keys in a secret manager or environment variables.




## Quick start

The typical flow when using iGPT is:

1. **Connect datasources** (per user)
2. **Retrieve answers** using the connected context


### Connect a datasource

This example starts an authorization flow to connect a user’s datasource.  
The response includes a **URL** the user must open to complete authorization.

```js
import IGPT from "igptai";

const igpt = new IGPT({
  apiKey: process.env.IGPT_API_KEY
});

const res = await igpt.connectors.authorize({
  service: "spike",
  scope: "messages",
  user: "user_123"
});

if (res?.error) {
  console.error("Connection error:", res);
} else {
  console.log("Open this URL to authorize:", res.url);
}
```

### Ask with `recall.ask()`

After connecting a datasource, you can retrieve answers scoped to that user.

```js
import IGPT from "igptai";

const igpt = new IGPT({
  apiKey: process.env.IGPT_API_KEY,
  user: "user_123" // optional default user
});

const res = await igpt.recall.ask({
  input: "Summarize key risks, decisions, and next steps from this week's meetings."
});

if (res?.error) {
  // No-throw design: handle errors via return value
  console.error("iGPT error:", res);
} else {
  console.log("iGPT response:", res);
}
```

---

## Services and routing

Calls map to API routes automatically, for example:

* `igpt.recall.ask(...)` → `POST /recall/ask`
* `igpt.recall.search(...)` → `POST /recall/search`
* `igpt.datasources.list(...)` → `POST /datasources/list`
* `igpt.datasources.disconnect(...)` → `POST /datasources/disconnect`
* `igpt.connectors.authorize(...)` → `POST /connectors/authorize`


## Connectors

### `connectors.authorize()`

Authorize, connect, and start indexing a new datasource. [↗](https://docs.igpt.ai/docs/api-reference/connect "API reference")

#### Parameters

* `service` (string, required): Service provider identifier (e.g., `"spike"`).
* `scope` (string, required): Space-delimited scopes (e.g., `"messages"`).
* `user` (string, optional if set in constructor): Unique user identifier.
* `redirect_uri` (string, optional): Redirect URL after authorization completes.
* `state` (string, optional): Application state (returned after redirect).

#### Example: start an authorization flow

```js
const res = await igpt.connectors.authorize({
  service: "spike",
  scope: "messages",
  redirect_uri: "https://your-app.com/callback",
  state: "optional_state"
});

console.log(res);
```


## Recall

### `recall.ask()`

Generate a response based on input and connected context. [↗](https://docs.igpt.ai/docs/api-reference/ask "API reference")

#### Parameters

* `input` (string, required): The prompt/question to ask.
* `user` (string, optional if set in constructor): Unique user identifier.
* `stream` (boolean, optional, default: `false`): If `true`, returns an async iterable stream.
* `quality` (string, optional): Context engineering quality (e.g., `"cef-1-normal"`). [Read more](https://docs.igpt.ai/docs/concepts/cef).
* `output_format` (string | object, optional):

  * `"text"` (default)
  * `"json"`
  * `{ schema: <JSON Schema> }` to enforce a structured output

#### Example: text output

```js
const res = await igpt.recall.ask({
  input: "Summarize my last meeting in 5 bullet points.",
  quality: "cef-1-normal",
  output_format: "text"
});

console.log(res);
```

#### Example: JSON output

```js
const res = await igpt.recall.ask({
  input: "Return a JSON object with { title, summary } for my last meeting.",
  output_format: "json"
});

console.log(res);
```

#### Example: Structured output with JSON Schema

Use a schema to get consistent, machine-validated structure.

```js
const output_format = {
  strict: true,
  schema: {
    type: "object",
    properties: {
      action_items: {
        type: "array",
        description: "List of action items",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short summary of the action item" },
            owner: { type: "string", description: "Person responsible for the action item" },
            due_date: { type: "string", format: "date", description: "Expected completion date" }
          },
          required: ["title", "owner", "due_date"],
          additionalProperties: false
        }
      }
    },
    required: ["action_items"],
    additionalProperties: false
  }
};

const res = await igpt.recall.ask({
  output_format,
  input: "Open action items from yesterday’s board meeting",
  quality: "cef-1-normal"
});

console.log(res);
```

#### Example response (schema)

```json
{
  "action_items": [
    {
      "title": "Approve revised Q1 budget allocation",
      "owner": "Dvir Ben-Aroya",
      "due_date": "2026-01-15"
    },
    {
      "title": "Approve final FY2026 strategic priorities",
      "owner": "Board of Directors",
      "due_date": "2026-01-31"
    }
  ]
}
```

### Streaming (SSE)

> Note: Streaming requests do not use retries. If a stream is interrupted, it terminates with an error chunk rather than retrying.

For streaming responses, set `stream: true`. The SDK returns an async iterable that yields parsed JSON chunks.

Streaming is designed to be resilient: if the stream breaks due to connectivity, the iterator yields an error chunk and finishes rather than throwing.

#### Parameters (streaming-specific)

* `stream` must be `true`
* Other parameters are the same as `recall.ask`

#### Example: basic streaming

```js
const stream = await igpt.recall.ask({
  input: "Stream the answer in chunks.",
  stream: true
});

if (stream?.error) {
  console.error("Stream init error:", stream);
} else {
  for await (const chunk of stream) {
    if (chunk?.error) {
      console.error("Stream chunk error:", chunk);
      break;
    }
    console.log("chunk:", chunk);
  }
}
```

### `recall.search()`

Search in connected datasources. [↗](https://docs.igpt.ai/docs/api-reference/search "API reference")

#### Parameters

* `query` (string, optional): Search query to execute.
* `user` (string, optional if set in constructor): Unique user identifier.
* `date_from` (string, optional): Start date filter (`YYYY-MM-DD`).
* `date_to` (string, optional): End date filter (`YYYY-MM-DD`).
* `max_results` (number, optional): Limit number of results (e.g., `50`).

#### Example: simple search

```js
const res = await igpt.recall.search({
  query: "board meeting notes"
});

console.log(res);
```

#### Example: date-bounded search

```js
const res = await igpt.recall.search({
  query: "budget allocation",
  date_from: "2026-01-01",
  date_to: "2026-01-31",
  max_results: 25
});

console.log(res);
```



## Datasources

### `datasources.list()`

List datasources and indexing status. [↗](https://docs.igpt.ai/docs/api-reference/list "API reference")

#### Parameters

* `user` (string, optional if set in constructor): Unique user identifier.

#### Example

```js
const res = await igpt.datasources.list();
console.log(res);
```

### `datasources.disconnect()`

Disconnect a datasource and remove indexed data. [↗](https://docs.igpt.ai/docs/api-reference/disconnect "API reference")

#### Parameters

* `id` (string, required): Datasource ID to disconnect (e.g., `"service/id/type"`).
* `user` (string, optional if set in constructor): Unique user identifier.

#### Example

```js
const res = await igpt.datasources.disconnect({
  id: "service/id/type"
});

console.log(res);
```

## Advanced Configuration

```js
const igpt = new IGPT({
  apiKey: process.env.IGPT_API_KEY,     // required
  user: "default_user_id",             // optional default user
  baseUrl: "https://api.igpt.ai/v1",   // optional override
  retries: 3,                          // optional: network retries for non-stream calls
  backoffBase: 100,                    // optional: initial retry delay (ms)
  backoffFactor: 2                     // optional: exponential backoff factor
});
```

> Note: Retries apply only to non-stream requests. Streaming requests disable retries by design.

### Constructor options

* `apiKey` (string, required): Your iGPT API key.
* `user` (string, optional): Default user identifier. If provided, you can omit `user` in method calls.
* `baseUrl` (string, optional): Override API base URL (default: `https://api.igpt.ai/v1`).
* `retries` (number, optional): Retry attempts for non-stream requests (default: `3`).
* `backoffBase` (number, optional): Initial retry delay in milliseconds (default: `100`).
* `backoffFactor` (number, optional): Exponential backoff multiplier (default: `2`).

## Error handling

The SDK does not throw exceptions for request or stream failures.  
Instead, it returns (or yields) **normalized error objects** with a consistent shape:

```js
{ error: string }
```

### Client errors
Errors originating from the client environment:

* `{ error: "network_error" }` - A network-level failure occurred (timeout, DNS issue, offline).
* `{ error: "request_aborted" }` - The request was explicitly aborted by the caller.

### Server errors
Errors returned by the API:

* `{ error: "auth" }` - Authentication failed due to missing, invalid, or expired credentials.
* `{ error: "params" }` - The request parameters were invalid or malformed.

---

## Security & compliance

- Use a secure secret manager for `IGPT_API_KEY` (do not hardcode keys in source control).
- Ensure user identifiers (`user`) align with your internal identity and access model.
- For policy and legal references:
  - Privacy Policy: [https://www.igpt.ai/privacy-policy/](https://www.igpt.ai/privacy-policy)
  - Terms & Conditions: [https://www.igpt.ai/terms-and-conditions/](https://www.igpt.ai/terms-and-conditions)

## Resources

* Docs: [https://docs.igpt.ai](https://docs.igpt.ai)
* Playground: [https://igpt.ai/hub/playground/](https://igpt.ai/hub/playground/)
* Book a demo: [https://www.igpt.ai/contact-sales/](https://www.igpt.ai/contact-sales/)
* Contact: [hello@igpt.ai](mailto:hello@igpt.ai)

## License

MIT