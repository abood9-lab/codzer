import type { LanguageModel } from 'ai';
import { BaseProvider, getOpenAILikeModel } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import { logger } from '~/utils/logger';
import { createTgiModel } from './remote-hosted-tgi';

interface OpenAIModelsResponse {
  data?: Array<{ id: string }>;
}

type Protocol = 'openai' | 'tgi';

/**
 * Fourth "local" provider: for machines too weak to run a model themselves.
 * The model lives somewhere else (a cloud GPU, a coworker's box, a hosted
 * inference server) and the user pastes the HTTPS base URL here. Chat requests
 * go through the server, so only that server needs to reach the URL — the
 * browser never does, which keeps the connection free of CORS problems.
 *
 * Two wire formats are supported and picked automatically:
 *   - OpenAI-compatible (vLLM, LM Studio, llama.cpp, Ollama /v1, TGI proxies)
 *   - HuggingFace TGI (`POST /generate`), detected when `/v1/models` is a 404
 *     but `/info` answers.
 */
export default class RemoteHostedProvider extends BaseProvider {
  name = 'RemoteHosted';
  getApiKeyLink = undefined;

  config = {
    baseUrlKey: 'REMOTE_HOSTED_API_BASE_URL',
    apiTokenKey: 'REMOTE_HOSTED_API_KEY',
  };

  staticModels: ModelInfo[] = [];

  /** Protocol per base URL, learned once so chat calls stay synchronous. */
  private _protocolByBaseUrl = new Map<string, Protocol>();

  private _rawBaseUrl(baseUrl?: string): string | undefined {
    if (!baseUrl) {
      return undefined;
    }

    const trimmed = baseUrl.trim().replace(/\/+$/, '');

    return trimmed || undefined;
  }

  /**
   * OpenAI-compatible servers expose the API under `/v1` (vLLM, LM Studio,
   * llama.cpp, Ollama's OpenAI route, TGI proxies). Users usually paste just
   * the origin, so add `/v1` only when the path is the bare root — an endpoint
   * that already carries a path (including `/v1`) is left untouched.
   */
  _openAiBaseUrl(baseUrl: string): string {
    try {
      const url = new URL(baseUrl);

      if (url.pathname === '/' || url.pathname === '') {
        url.pathname = '/v1';
        return url.toString().replace(/\/+$/, '');
      }
    } catch {
      // Not a parseable URL — pass it through and let the fetch fail loudly.
    }

    return baseUrl;
  }

  /** TGI serves at the origin, so a pasted `/v1` suffix is stripped back off. */
  _tgiBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  }

  private _recordProtocol(baseUrl: string, protocol: Protocol) {
    this._protocolByBaseUrl.set(baseUrl, protocol);
  }

  /**
   * Probes the endpoint to learn which wire format it speaks:
   *   - 2xx on the OpenAI models list -> OpenAI
   *   - 404 on it, 2xx on /info       -> TGI
   *   - anything else (401/403/timeouts) -> OpenAI, so auth errors stay visible
   */
  async _detectProtocol(baseUrl: string): Promise<Protocol> {
    const cached = this._protocolByBaseUrl.get(baseUrl);

    if (cached) {
      return cached;
    }

    const openAiBase = this._openAiBaseUrl(baseUrl);
    const tgiBase = this._tgiBaseUrl(baseUrl);

    let protocol: Protocol = 'openai';

    try {
      const response = await fetch(`${openAiBase}/models`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

      logger.info(`${this.name}: probe ${openAiBase}/models -> HTTP ${response.status}`);

      if (response.status === 404) {
        protocol = await this._probeTgi(tgiBase);
      }
    } catch (error) {
      logger.info(`${this.name}: probe ${openAiBase}/models failed`, error);
      protocol = await this._probeTgi(tgiBase);
    }

    logger.info(`${this.name}: protocol for ${baseUrl} -> ${protocol}`);

    this._recordProtocol(baseUrl, protocol);

    return protocol;
  }

  private async _probeTgi(tgiBase: string): Promise<Protocol> {
    try {
      const response = await fetch(`${tgiBase}/info`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

      logger.info(`${this.name}: probe ${tgiBase}/info -> HTTP ${response.status}`);

      return response.ok ? 'tgi' : 'openai';
    } catch (error) {
      logger.info(`${this.name}: probe ${tgiBase}/info failed`, error);

      return 'openai';
    }
  }

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv,
      defaultBaseUrlKey: 'REMOTE_HOSTED_API_BASE_URL',
      defaultApiTokenKey: 'REMOTE_HOSTED_API_KEY',
    });

    const rawBaseUrl = this._rawBaseUrl(baseUrl);

    if (!rawBaseUrl) {
      return [];
    }

    /*
     * A pasted endpoint may require a bearer token: prefer the key typed into
     * the provider card (it travels in the `providers` cookie), then fall back
     * to REMOTE_HOSTED_API_KEY / the apiKeys cookie handled by the base class.
     */
    const credential = settings?.apiKey || apiKey;

    const protocol = await this._detectProtocol(rawBaseUrl);

    try {
      if (protocol === 'tgi') {
        const modelInfo = await this._fetchTgiModels(this._tgiBaseUrl(rawBaseUrl));

        return modelInfo;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (credential) {
        headers.Authorization = `Bearer ${credential}`;
      }

      logger.info(`${this.name}: listing models with credential=${credential ? 'yes' : 'no'}`);

      const listUrl = `${this._openAiBaseUrl(rawBaseUrl)}/models`;
      const response = await fetch(listUrl, {
        headers,
        signal: this.createTimeoutSignal(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} (${listUrl})`);
      }

      const res = (await response.json()) as OpenAIModelsResponse;

      return (res.data ?? []).map((model) => ({
        name: model.id,
        label: model.id,
        provider: this.name,
        maxTokenAllowed: 8000,
      }));
    } catch (error) {
      logger.info(`${this.name}: could not list models at ${rawBaseUrl}`, error);

      return [];
    }
  }

  /** TGI has no model list, only GET /info with the served model_id. */
  private async _fetchTgiModels(tgiBase: string): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${tgiBase}/info`, {
        headers: { Accept: 'application/json' },
        signal: this.createTimeoutSignal(),
      });

      if (!response.ok) {
        return [];
      }

      const info = (await response.json()) as { model_id?: string };

      if (!info.model_id) {
        return [];
      }

      return [
        {
          name: info.model_id,
          label: `${info.model_id} (TGI)`,
          provider: this.name,
          maxTokenAllowed: 8000,
        },
      ];
    } catch (error) {
      logger.info(`${this.name}: could not read TGI /info at ${tgiBase}`, error);

      return [];
    }
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModel {
    const { model, serverEnv, apiKeys, providerSettings } = options;
    const envRecord = this.convertEnvToRecord(serverEnv);

    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: envRecord,
      defaultBaseUrlKey: 'REMOTE_HOSTED_API_BASE_URL',
      defaultApiTokenKey: 'REMOTE_HOSTED_API_KEY',
    });

    const credential = providerSettings?.[this.name]?.apiKey || apiKey;

    const rawBaseUrl = this._rawBaseUrl(baseUrl);

    if (!rawBaseUrl) {
      throw new Error(
        `Missing API endpoint for ${this.name} provider. Set the HTTPS base URL in Settings → Local Providers.`,
      );
    }

    return new RemoteHostedModel(this, rawBaseUrl, credential, model) as unknown as LanguageModel;
  }
}

/**
 * Structural view of an AI SDK language model. `@ai-sdk/provider` is only a
 * transitive dependency here (pnpm does not hoist it), so the exact
 * `LanguageModelV2` type cannot be imported — delegating by shape keeps this
 * compiling without adding a dependency, and the runtime contract is covered
 * by the provider tests.
 */
interface DelegatingModel {
  doGenerate(options: any): Promise<any>;
  doStream(options: any): Promise<any>;
}

/**
 * Wraps whichever transport the endpoint speaks. Model listing has already
 * probed the URL by the time a chat happens, so the protocol is normally known
 * and this resolves on the first call without an extra round trip; when it is
 * not known, the probe runs here (doGenerate/doStream are async) and is cached
 * for later calls.
 */
class RemoteHostedModel {
  /*
   * MUST match the spec of the model we delegate to: both transports are
   * createOpenAI() instances, which declare "v4". Declaring "v2" makes the AI
   * SDK wrap this model in convertV2FinishReasonToV3, turning finishReason
   * into {unified, raw} — a shape the UIMessageChunk schema rejects with
   * "Type validation failed", which surfaced as a Server Error after every
   * reply.
   */
  specificationVersion = 'v4' as const;
  provider = 'remote-hosted';
  modelId: string;

  /* bolt never sends image/audio URLs to this provider. */
  supportedUrls: Record<string, RegExp[]> = { http: [], https: [] };

  private _inner: DelegatingModel | undefined;

  constructor(
    private readonly _provider: RemoteHostedProvider,
    private readonly _baseUrl: string,
    private readonly _apiKey: string | undefined,
    model: string,
  ) {
    this.modelId = model;
  }

  private async _resolve(): Promise<DelegatingModel> {
    if (this._inner) {
      return this._inner;
    }

    const protocol = await this._provider._detectProtocol(this._baseUrl);

    this._inner =
      protocol === 'tgi'
        ? (createTgiModel(this._provider._tgiBaseUrl(this._baseUrl), this.modelId) as unknown as DelegatingModel)
        : (getOpenAILikeModel(
            this._provider._openAiBaseUrl(this._baseUrl),
            this._apiKey || 'no-api-key',
            this.modelId,
          ) as unknown as DelegatingModel);

    return this._inner;
  }

  async doGenerate(options: unknown) {
    return (await this._resolve()).doGenerate(options);
  }

  async doStream(options: unknown) {
    return (await this._resolve()).doStream(options);
  }
}
