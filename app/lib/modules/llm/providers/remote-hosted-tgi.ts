import { createOpenAI } from '@ai-sdk/openai';

/**
 * A TGI (HuggingFace Text Generation Inference) endpoint exposes POST /generate
 * and /generate_stream — not the OpenAI wire format bolt speaks. Instead of
 * writing a LanguageModel implementation from scratch (stream parts, finish
 * reasons, usage, tool-call plumbing), this module sits in front of the
 * official OpenAI provider as a `fetch` that rewrites the conversation:
 *
 *   POST {base}/chat/completions  ->  POST {base}/generate[_stream]
 *   GET  {base}/models            ->  GET  {base}/info   (model_id listing)
 *
 * so the battle-tested OpenAI transport does the parsing and TGI only ever
 * sees prompts and token streams.
 */

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface OpenAIChatMessage {
  role?: string;
  content?: unknown;
}

interface OpenAIChatRequest {
  messages?: OpenAIChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
}

interface TgiDetails {
  finish_reason?: string;
  generated_tokens?: number;
}

interface TgiChunk {
  token?: { text?: string; special?: boolean };
  generated_text?: string | null;
  details?: TgiDetails | null;
}

interface TgiResponse {
  generated_text?: string;
  details?: TgiDetails;
}

/** TGI has no chat-template endpoint, so roles are flattened into a transcript. */
function toPrompt(messages: OpenAIChatMessage[] | undefined): string {
  const textOf = (content: unknown): string => {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part: any) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
        .join('');
    }

    return content == null ? '' : String(content);
  };

  const lines: string[] = [];

  for (const message of messages ?? []) {
    const role = message.role || 'user';
    const text = textOf(message.content);

    if (!text && role !== 'system') {
      continue;
    }

    if (role === 'system') {
      lines.push(`System: ${text}`);
    } else if (role === 'assistant') {
      lines.push(`Assistant: ${text}`);
    } else {
      lines.push(`User: ${text}`);
    }
  }

  lines.push('Assistant:');

  return lines.join('\n');
}

function mapFinishReason(reason?: string): 'stop' | 'length' {
  return reason === 'length' ? 'length' : 'stop';
}

function errorResponse(status: number, message: string): Response {
  return Response.json({ error: { message, type: 'tgi_error', code: status } }, { status });
}

/**
 * Rewrites OpenAI-shaped requests to TGI and back. `baseURL` is the TGI root
 * (TGI serves everything at the origin, with no `/v1` prefix).
 */
export function createTgiFetch(baseURL: string): FetchLike {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname.replace(/\/+$/, '');

    if (path.endsWith('/chat/completions')) {
      return handleChatCompletions(request, baseURL);
    }

    if (path.endsWith('/models')) {
      return handleModels(baseURL);
    }

    // Anything else is not part of the shim — let it go through unchanged.
    return fetch(request);
  };
}

async function handleModels(baseURL: string): Promise<Response> {
  try {
    const response = await fetch(`${baseURL}/info`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return errorResponse(response.status, `TGI /info responded with HTTP ${response.status}`);
    }

    const info = (await response.json()) as { model_id?: string };
    const modelId = info.model_id || 'tgi-model';

    return Response.json({
      object: 'list',
      data: [{ id: modelId, object: 'model', created: 0, owned_by: 'tgi' }],
    });
  } catch (error) {
    return errorResponse(502, `Could not reach TGI /info: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}

async function handleChatCompletions(request: Request, baseURL: string): Promise<Response> {
  let body: OpenAIChatRequest;

  try {
    body = (await request.json()) as OpenAIChatRequest;
  } catch {
    return errorResponse(400, 'Request body was not valid JSON');
  }

  const wantsStream = body.stream === true;
  const temperature = typeof body.temperature === 'number' ? body.temperature : undefined;
  const doSample = temperature !== undefined && temperature > 0;

  const parameters: Record<string, unknown> = {
    max_new_tokens: Math.max(1, Math.min(body.max_tokens ?? 1024, 8192)),
    do_sample: doSample,
    return_full_text: false,
  };

  // TGI rejects sampling knobs while do_sample is false, so only send them
  // when they are actually in play.
  if (doSample) {
    if (temperature !== undefined) {
      parameters.temperature = temperature;
    }

    if (typeof body.top_p === 'number') {
      parameters.top_p = body.top_p;
    }
  }

  const stop = body.stop;

  if (Array.isArray(stop) && stop.length) {
    parameters.stop = stop.slice(0, 4);
  } else if (typeof stop === 'string' && stop) {
    parameters.stop = [stop];
  }

  let response: Response;

  try {
    response = await fetch(`${baseURL}/${wantsStream ? 'generate_stream' : 'generate'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: toPrompt(body.messages), parameters, stream: wantsStream }),
      signal: request.signal,
    });
  } catch (error) {
    return errorResponse(
      502,
      `Could not reach TGI at ${baseURL}: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    return errorResponse(
      response.status,
      `TGI responded with HTTP ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ''}`,
    );
  }

  if (!wantsStream) {
    return mapGenerateResponse(response);
  }

  return mapGenerateStream(response);
}

/** POST /generate -> an OpenAI chat.completion object. */
async function mapGenerateResponse(response: Response): Promise<Response> {
  let data: TgiResponse;

  try {
    data = (await response.json()) as TgiResponse;
  } catch {
    return errorResponse(502, 'TGI returned a body that was not JSON');
  }

  const created = Math.floor(Date.now() / 1000);
  const completionTokens = data.details?.generated_tokens ?? 0;

  return Response.json({
    id: `tgi-${created}`,
    object: 'chat.completion',
    created,
    model: 'tgi',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: data.generated_text ?? '' },
        finish_reason: mapFinishReason(data.details?.finish_reason),
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: completionTokens, total_tokens: completionTokens },
  });
}

/** POST /generate_stream -> OpenAI chat.completion.chunk SSE. */
function mapGenerateStream(response: Response): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (!response.body) {
    return errorResponse(502, 'TGI returned an empty stream');
  }

  const reader = response.body.getReader();
  const created = Math.floor(Date.now() / 1000);
  const meta = { id: `tgi-${created}`, object: 'chat.completion.chunk', created, model: 'tgi' };

  const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) =>
    `data: ${JSON.stringify({ ...meta, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = '';
      let announcedRole = false;

      try {
        for (;;) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();

            if (!line.startsWith('data:')) {
              continue;
            }

            const payload = line.slice(5).trim();

            if (!payload || payload === '[DONE]') {
              continue;
            }

            let parsed: TgiChunk;

            try {
              parsed = JSON.parse(payload) as TgiChunk;
            } catch {
              continue;
            }

            // `special` tokens such as </s> are control tokens, not content.
            const text = parsed.token && !parsed.token.special ? (parsed.token.text ?? '') : '';

            if (text) {
              const delta = announcedRole ? { content: text } : { role: 'assistant', content: text };
              announcedRole = true;
              controller.enqueue(encoder.encode(chunk(delta)));
            }

            if (parsed.generated_text != null) {
              controller.enqueue(encoder.encode(chunk({}, mapFinishReason(parsed.details?.finish_reason))));
            }
          }
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: { message: error instanceof Error ? error.message : 'stream failed' } })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

/** A language model that talks to a TGI server through the OpenAI transport. */
export function createTgiModel(baseURL: string, model: string) {
  const openai = createOpenAI({
    baseURL,
    apiKey: 'not-needed',
    fetch: createTgiFetch(baseURL) as any,
  });

  return openai.chat(model);
}
