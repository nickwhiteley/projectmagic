// Calling a model (PM3): Ollama, OpenAI or Anthropic, chosen by the environment. Each takes a
// system and a user message and returns the text and the tokens it cost.
export type Provider = 'ollama' | 'openai' | 'anthropic';

export interface ModelConfig {
	provider: Provider;
	model: string;
	baseUrl: string;
	apiKey: string | null;
}

export interface Completion {
	text: string;
	tokens: number;
}

export interface CompleteOptions {
	/** Ask for a JSON object (the default); false for free text. */
	json?: boolean;
	/** The most tokens in the reply (Anthropic requires one). */
	maxTokens?: number;
}

export type Complete = (
	system: string,
	user: string,
	options?: CompleteOptions
) => Promise<Completion>;

const DEFAULT_MODEL: Record<Provider, string> = {
	ollama: 'llama3.1',
	openai: 'gpt-4o-mini',
	anthropic: 'claude-haiku-5-5'
};

/** The model to use from the environment, or null when inference is off or half set up. */
export function modelFromEnv(env: {
	provider?: string;
	model?: string;
	baseUrl?: string;
	apiKey?: string;
}): ModelConfig | null {
	const provider = env.provider as Provider | undefined;
	if (!provider) return null;
	if (provider === 'ollama') {
		if (!env.baseUrl) return null;
		return {
			provider,
			model: env.model ?? DEFAULT_MODEL.ollama,
			baseUrl: env.baseUrl,
			apiKey: null
		};
	}
	if (!env.apiKey) return null;
	return {
		provider,
		model: env.model ?? DEFAULT_MODEL[provider],
		baseUrl:
			env.baseUrl ??
			(provider === 'openai' ? 'https://api.openai.com' : 'https://api.anthropic.com'),
		apiKey: env.apiKey
	};
}

async function post<T>(
	url: string,
	headers: Record<string, string>,
	body: unknown,
	f: typeof fetch
) {
	const res = await f(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(60_000)
	});
	if (!res.ok) throw new Error(`${url.split('/').slice(0, 3).join('/')} ${res.status}`);
	return (await res.json()) as T;
}

export function completer(cfg: ModelConfig, f: typeof fetch = fetch): Complete {
	const base = cfg.baseUrl.replace(/\/$/, '');
	return async (system, user, { json = true, maxTokens = 200 } = {}) => {
		if (cfg.provider === 'ollama') {
			const r = await post<{
				message?: { content?: string };
				prompt_eval_count?: number;
				eval_count?: number;
			}>(
				`${base}/api/chat`,
				{},
				{
					model: cfg.model,
					stream: false,
					...(json ? { format: 'json' } : { options: { num_predict: maxTokens } }),
					messages: [
						{ role: 'system', content: system },
						{ role: 'user', content: user }
					]
				},
				f
			);
			return {
				text: r.message?.content ?? '',
				tokens: (r.prompt_eval_count ?? 0) + (r.eval_count ?? 0)
			};
		}
		if (cfg.provider === 'openai') {
			const r = await post<{
				choices?: { message?: { content?: string } }[];
				usage?: { total_tokens?: number };
			}>(
				`${base}/v1/chat/completions`,
				{ authorization: `Bearer ${cfg.apiKey}` },
				{
					model: cfg.model,
					...(json ? { response_format: { type: 'json_object' } } : { max_tokens: maxTokens }),
					messages: [
						{ role: 'system', content: system },
						{ role: 'user', content: user }
					]
				},
				f
			);
			return { text: r.choices?.[0]?.message?.content ?? '', tokens: r.usage?.total_tokens ?? 0 };
		}
		const r = await post<{
			content?: { type: string; text?: string }[];
			usage?: { input_tokens?: number; output_tokens?: number };
		}>(
			`${base}/v1/messages`,
			{ 'x-api-key': cfg.apiKey!, 'anthropic-version': '2023-06-01' },
			{
				model: cfg.model,
				max_tokens: maxTokens,
				system,
				messages: [{ role: 'user', content: user }]
			},
			f
		);
		return {
			text: r.content?.find((c) => c.type === 'text')?.text ?? '',
			tokens: (r.usage?.input_tokens ?? 0) + (r.usage?.output_tokens ?? 0)
		};
	};
}
