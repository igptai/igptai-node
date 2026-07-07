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

### Run with `recall.run()`

After connecting a datasource, you can run an agentic request scoped to that user.

A run can retrieve relevant context, use available tools, and generate a response based on the connected datasource.

```js
import IGPT from "igptai";

const igpt = new IGPT({
  apiKey: process.env.IGPT_API_KEY,
  user: "user_123"
});

const res = await igpt.recall.run({
  input: "Summarize key risks, decisions, and next steps from this week's meetings.",
  quality: "cef-4-high",
  reasoning_effort: "high"
});

if (res?.error) {
  console.error("iGPT error:", res);
} else {
  console.log("iGPT response:", res.output);
}
```

---

## Services and routing

Calls map to API routes automatically, for example:

* `igpt.recall.run(...)` → `POST /recall/run`
* `igpt.recall.search(...)` → `POST /recall/search`
* `igpt.recall.ask(...)` → `POST /recall/ask`
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

## Agentic Run

### `recall.run()`

Generate an agentic response based on the provided input and the end-user’s connected context.

A run may perform multiple reasoning turns, call internal tools, retrieve relevant sources, and stream the final response as it is generated.

#### Parameters

* `input` (string, required): The prompt or question to process.
* `user` (string, optional if set in constructor): A unique identifier representing your end-user.
* `stream` (boolean, optional, default: `false`): When `true`, returns an async iterable of run events.
* `quality` (string, optional): Context engineering quality (e.g., `"cef-4-high"`).
* `reasoning_effort` (string, optional): Controls the reasoning effort (e.g., `"low"`, `"medium"`, or `"high"`).
* `output_format` (string | object, optional):
  * `"text"` - Plain-text output and the default format.
  * `"json"` - JSON output.
  * `{ schema: <JSON Schema> }` - Structured output that follows a JSON Schema.
* `instructions` (string, optional): Additional instructions controlling the response behavior, style, constraints, or structure.

#### Example: text output

```js
const res = await igpt.recall.run({
  input: "Summarize my unread emails from the last 7 days.",
  quality: "cef-4-high",
  reasoning_effort: "high",
  output_format: "text",
  instructions: "Be concise and highlight anything that needs a response."
});

if (res?.error) {
  console.error("iGPT error:", res);
} else {
  console.log(res.output);
}
```

#### Example: JSON output

```js
const res = await igpt.recall.run({
  input: "Summarize my last meeting and return the title and summary.",
  output_format: "json"
});

console.log(res.output);
```

#### Example: structured output with JSON Schema

Use a schema to produce a consistent, machine-readable response.

```js
const output_format = {
  type: "json_schema",
  name: "action_items",
  strict: true,
  schema: {
    type: "object",
    properties: {
      action_items: {
        type: "array",
        description: "Action items found in the connected context",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "A short description of the action item"
            },
            owner: {
              type: "string",
              description: "The person responsible for the action item"
            },
            due_date: {
              type: "string",
              format: "date",
              description: "The expected completion date"
            }
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

const res = await igpt.recall.run({
  input: "Find open action items from yesterday’s board meeting.",
  quality: "cef-4-high",
  reasoning_effort: "high",
  stream: false,
  output_format
});

console.log(res.output);
```

### Streaming

For streaming responses, set `stream: true`.

The SDK returns an async iterable that yields parsed JSON events. Each event represents a step in the run lifecycle.

```js
const stream = await igpt.recall.run({
  input: "Summarize my unread emails from the last 7 days.",
  stream: true,
  quality: "cef-4-high",
  reasoning_effort: "high",
  output_format: "text"
});

if (stream?.error) {
  console.error("Stream initialization error:", stream);
} else {
  for await (const event of stream) {
    if (event?.error) {
      console.error("Stream error:", event);
      break;
    }

    if (event.type === "run.output_text.delta") {
      process.stdout.write(event.delta);
    }

    if (event.type === "run.done") {
      console.log("\nRun completed.");
    }
  }
}
```

> Note: Streaming requests do not use retries. If a stream is interrupted, the iterator yields an error object and finishes instead of retrying.

### Stream lifecycle

A streamed run starts with `run.start` and ends with `run.done`.

Everything between these two events belongs to the same run.

A run may contain one or more turns. Each turn may include reasoning, tool calls, or output generation.

```text
run.start

  run.turn.start
    run.reasoning_item.start
    run.reasoning_item.done

    run.tool_call_item
  run.turn.done

  run.tool_call_output_item

  run.turn.start
    run.reasoning_item.start

      run.reasoning_summary_part.start
      run.reasoning_summary_part.done

    run.reasoning_item.done

    run.output_item.start
      run.output_text.delta
      run.output_text.delta
      ...
    run.output_item.done
  run.turn.done

run.done
```

This lifecycle is representative. The exact number of turns, reasoning items, summary parts, tool calls, and output deltas depends on the request.

Important relationships:

- `run.start` opens the complete run.
- `run.done` closes the complete run.
- `seq` defines the exact order of all events in the run.
- `turn` identifies the model turn being processed.
- `callId` connects a tool call with its corresponding tool result.
- `run.output_text.delta` contains partial output text.
- `run.output_item.done` contains the complete assistant message.
- `run.done` contains the final run output, usage, duration, and aggregated source metadata.
- A `run.tool_call_output_item` may appear between the turn that requested the tool and the next turn that processes its result.
- Reasoning summary events are optional and may not appear in every turn.

### Stream event object shapes

> The following JSON objects document the expected key types. Values such as `"string"`, `"number"`, `"object"`, and `"array<object>"` describe the value type and are not literal API response values.

#### `run.start`

```json
{
  "type": "run.start",
  "seq": "number",
  "id": "string",
  "timestamp": "number",
  "context": {
    "quality": "string",
    "reasoning_effort": "string",
    "indexed": "number",
    "datasources": [
      {
        "id": "string",
        "service": "string",
        "type": "string",
        "status": "string",
        "title": "string",
        "subtitle": "string",
        "progress": "number",
        "newest": "number",
        "oldest": "number"
      }
    ]
  },
  "output_format": "string | object"
}
```

#### `run.turn.start`

```json
{
  "type": "run.turn.start",
  "seq": "number",
  "turn": "number"
}
```

#### `run.reasoning_item.start`

```json
{
  "type": "run.reasoning_item.start",
  "seq": "number",
  "item": {
    "type": "reasoning"
  }
}
```

#### `run.reasoning_item.done`

```json
{
  "type": "run.reasoning_item.done",
  "seq": "number",
  "item": {
    "type": "reasoning",
    "content": "array",
    "summary": [
      {
        "type": "summary_text",
        "text": "string"
      }
    ]
  }
}
```

#### `run.reasoning_summary_part.start`

```json
{
  "type": "run.reasoning_summary_part.start",
  "seq": "number"
}
```

#### `run.reasoning_summary_part.done`

```json
{
  "type": "run.reasoning_summary_part.done",
  "seq": "number",
  "text": "string"
}
```

#### `run.tool_call_item`

```json
{
  "type": "run.tool_call_item",
  "seq": "number",
  "item": {
    "type": "function_call",
    "arguments": "string",
    "name": "string",
    "callId": "string"
  }
}
```

#### `run.turn.done`

```json
{
  "type": "run.turn.done",
  "seq": "number",
  "turn": "number"
}
```

#### `run.tool_call_output_item`

```json
{
  "type": "run.tool_call_output_item",
  "seq": "number",
  "item": {
    "type": "function_call_result",
    "name": "string",
    "callId": "string",
    "metadata": {
      "sources": [
        {
          "id": "string",
          "type": "string",
          "timestamp": "number",
          "provider": "string",
          "picture": "string",
          "title": "string"
        }
      ]
    }
  }
}
```

#### `run.output_item.start`

```json
{
  "type": "run.output_item.start",
  "seq": "number",
  "item": {
    "type": "message"
  }
}
```

#### `run.output_text.delta`

```json
{
  "type": "run.output_text.delta",
  "seq": "number",
  "delta": "string"
}
```

#### `run.output_item.done`

```json
{
  "type": "run.output_item.done",
  "seq": "number",
  "item": {
    "type": "message",
    "content": [
      {
        "type": "output_text",
        "text": "string"
      }
    ],
    "role": "assistant"
  }
}
```

#### `run.done`

```json
{
  "type": "run.done",
  "id": "string",
  "seq": "number",
  "timestampStart": "number",
  "timestamp": "number",
  "duration": "number",
  "output": "string | object | array | null",
  "usage": {
    "input_tokens": "number",
    "output_tokens": "number",
    "total_tokens": "number"
  },
  "metadata": {
    "sources": [
      {
        "id": "string",
        "type": "string",
        "timestamp": "number",
        "provider": "string",
        "picture": "string",
        "title": "string"
      }
    ]
  }
}
```

### Understanding the stream keys

#### Common event keys

| Key | Type | Description |
|---|---|---|
| `type` | `string` | Identifies what happened in the stream, for example `"run.start"` or `"run.output_text.delta"`. |
| `seq` | `number` | Monotonically increasing sequence number defining the event’s exact order within the run. |
| `id` | `string` | Unique identifier for the complete run. It appears on `run.start` and `run.done`. |
| `timestamp` | `number` | Unix timestamp in milliseconds for run-level events. |
| `timestampStart` | `number` | Unix timestamp in milliseconds indicating when the completed run began. |
| `duration` | `number` | Total run duration in milliseconds. |

#### Run context keys

| Key | Type | Description |
|---|---|---|
| `context` | `object` | Context configuration and datasource state used by the run. |
| `context.quality` | `string` | Context engineering quality used for the run. |
| `context.reasoning_effort` | `string` | Reasoning effort selected for the run. |
| `context.indexed` | `number` | Number of indexed datasources available to the run. |
| `context.datasources` | `array<object>` | Connected and indexed datasources available to the run. |
| `output_format` | `string \| object` | Output format selected for the run. |

#### Datasource keys

| Key | Type | Description |
|---|---|---|
| `id` | `string` | Unique datasource identifier. |
| `service` | `string` | Service that owns the datasource. |
| `type` | `string` | Datasource type, such as `"spike/messages"`. |
| `status` | `string` | Current datasource status, such as `"enabled"`. |
| `title` | `string` | Human-readable datasource name. |
| `subtitle` | `string` | Additional datasource information, such as the connected account. |
| `progress` | `number` | Indexing progress, generally represented from `0` to `100`. |
| `newest` | `number` | Unix timestamp in seconds for the newest indexed item. |
| `oldest` | `number` | Unix timestamp in seconds for the oldest indexed item. |

#### Turn and reasoning keys

| Key | Type | Description |
|---|---|---|
| `turn` | `number` | Sequential model turn number inside the run. |
| `item` | `object` | The nested item carried by the event. |
| `item.type` | `string` | Identifies the nested item, such as `"reasoning"`, `"function_call"`, or `"message"`. |
| `item.content` | `array` | Reasoning content blocks. This may be empty when only a summary is exposed. |
| `item.summary` | `array<object>` | Reasoning summary items exposed by the API. |
| `text` | `string` | Complete reasoning-summary text when a summary part finishes. |

#### Tool-call keys

| Key | Type | Description |
|---|---|---|
| `item.name` | `string` | Name of the requested tool or function. |
| `item.arguments` | `string` | JSON-encoded function arguments. Use `JSON.parse()` to convert the value into an object. |
| `item.callId` | `string` | Unique identifier connecting a function call with its corresponding result. |
| `item.metadata` | `object` | Metadata returned by the completed tool call. |
| `item.metadata.sources` | `array<object>` | Sources returned or used by the tool call. |

Example of parsing tool arguments:

```js
if (event.type === "run.tool_call_item") {
  const args = JSON.parse(event.item.arguments);

  console.log("Tool:", event.item.name);
  console.log("Arguments:", args);
  console.log("Call ID:", event.item.callId);
}
```

#### Output keys

| Key | Type | Description |
|---|---|---|
| `delta` | `string` | Partial output fragment. Concatenate all deltas in `seq` order to construct the streamed response. |
| `item.content` | `array<object>` | Complete output content blocks when the assistant message finishes. |
| `item.role` | `string` | Role that generated the message. For assistant output, the value is `"assistant"`. |
| `output` | `string \| object \| array \| null` | Final output of the complete run. Its shape depends on `output_format`. |
| `usage` | `object` | Token usage for the complete run. |
| `usage.input_tokens` | `number` | Number of tokens used as model input. |
| `usage.output_tokens` | `number` | Number of tokens generated by the model. |
| `usage.total_tokens` | `number` | Total number of input and output tokens. |
| `metadata` | `object` | Final metadata collected for the complete run. |
| `metadata.sources` | `array<object>` | Aggregated sources used during the run. |

#### Source keys

| Key | Type | Description |
|---|---|---|
| `id` | `string` | Unique source identifier. |
| `type` | `string` | Source type, such as `"message"`. |
| `timestamp` | `number` | Unix timestamp in seconds associated with the source. |
| `provider` | `string` | Person, service, or organization that provided the source. |
| `picture` | `string` | Source image or avatar URL. |
| `title` | `string` | Human-readable source title. |

### Consuming stream events

```js
const stream = await igpt.recall.run({
  input: "Summarize my unread emails from the last 7 days.",
  stream: true
});

let output = "";

for await (const event of stream) {
  switch (event.type) {
    case "run.start":
      console.log("Run started:", event.id);
      console.log("Datasources:", event.context.datasources);
      break;

    case "run.turn.start":
      console.log("Turn started:", event.turn);
      break;

    case "run.tool_call_item":
      console.log("Calling tool:", event.item.name);
      console.log("Call ID:", event.item.callId);
      console.log("Arguments:", JSON.parse(event.item.arguments));
      break;

    case "run.tool_call_output_item":
      console.log("Tool completed:", event.item.name);
      console.log("Sources:", event.item.metadata.sources);
      break;

    case "run.output_text.delta":
      output += event.delta;
      process.stdout.write(event.delta);
      break;

    case "run.output_item.done":
      console.log("\nComplete message:", event.item.content);
      break;

    case "run.done":
      console.log("\nRun completed:", event.id);
      console.log("Duration:", event.duration);
      console.log("Usage:", event.usage);
      console.log("Final output:", event.output);
      break;
  }
}
```

## Recall

### `recall.search()`

Search in connected datasources. [↗](https://docs.igpt.ai/docs/api-reference/search "API reference")

#### Parameters

* `query` (string, optional): Search query to execute.
* `user` (string, optional if set in constructor): Unique user identifier.
* `date_from` (string, optional): Start date filter (`YYYY-MM-DD`).
* `date_to` (string, optional): End date filter (`YYYY-MM-DD`).
* `filter_people` (string, optional): Restrict results to content involving specific people.
* `max_results` (number, optional): Limit number of results (e.g., `50`).

#### Example: simple search

```js
const res = await igpt.recall.search({
  query: "board meeting notes"
});

console.log(res);
```

#### Example: search by people

```js
const res = await igpt.recall.search({
  query: "Open action items",
  filter_people: [
    "dvir@example.com",
    "Jane Smith"
  ],
  max_results: 25
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

> Note: Streaming requests do not use retries.  
> If a stream is interrupted, it terminates with an error chunk rather than retrying.

For streaming responses, set `stream: true`.

The SDK returns an async iterable that yields parsed JSON chunks.

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

> Note: Retries apply only to non-stream requests.  
> Streaming requests disable retries by design.

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