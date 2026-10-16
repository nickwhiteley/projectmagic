import { describe, expect, it } from 'vitest';
import { completer, modelFromEnv } from './models.ts';

const reply = (body: unknown): typeof fetch =>
	(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

describe('modelFromEnv', () => {
	it('is off with no provider, or one that is half set up', () => {
		expect(modelFromEnv({})).toBeNull();
		expect(modelFromEnv({ provider: 'ollama' })).toBeNull();
		expect(modelFromEnv({ provider: 'openai' })).toBeNull();
		expect(modelFromEnv({ provider: 'anthropic', model: 'x' })).toBeNull();
	});
	it('takes Ollama from its address, with a default model', () => {
		expect(modelFromEnv({ provider: 'ollama', baseUrl: 'http://h:11434' })).toEqual({
			provider: 'ollama',
			model: 'llama3.1',
			baseUrl: 'http://h:11434',
			apiKey: null
		});
	});
	it('takes Ollama cloud from its key alone, and sends the key', async () => {
		const cfg = modelFromEnv({ provider: 'ollama', apiKey: 'k' })!;
		expect(cfg).toMatchObject({ baseUrl: 'https://ollama.com', apiKey: 'k' });
		let auth: string | null = null;
		const f = (async (_u: string, init: RequestInit) => {
			auth = new Headers(init.headers).get('authorization');
			return new Response(JSON.stringify({ message: { content: 'x' } }));
		}) as unknown as typeof fetch;
		await completer(cfg, f)('s', 'u');
		expect(auth).toBe('Bearer k');
	});
	it('takes OpenAI and Anthropic from their key', () => {
		expect(modelFromEnv({ provider: 'openai', apiKey: 'k' })).toMatchObject({
			baseUrl: 'https://api.openai.com',
			apiKey: 'k'
		});
		expect(modelFromEnv({ provider: 'anthropic', apiKey: 'k', model: 'm' })).toMatchObject({
			baseUrl: 'https://api.anthropic.com',
			model: 'm'
		});
	});
});

describe('completer: free text', () => {
	it('asks for no JSON, and caps the reply', async () => {
		let sent: { format?: string; options?: { num_predict: number } } = {};
		const c = completer(
			{ provider: 'ollama', model: 'm', baseUrl: 'http://h', apiKey: null },
			(async (_u: unknown, init: { body: string }) => {
				sent = JSON.parse(init.body);
				return new Response(JSON.stringify({ message: { content: 'hi' } }));
			}) as unknown as typeof fetch
		);
		await c('s', 'u', { json: false, maxTokens: 500 });
		expect(sent.format).toBeUndefined();
		expect(sent.options?.num_predict).toBe(500);
	});
});

describe('completer', () => {
	it('reads Ollama', async () => {
		const c = completer(
			{ provider: 'ollama', model: 'm', baseUrl: 'http://h', apiKey: null },
			reply({ message: { content: '{"status":"todo"}' }, prompt_eval_count: 40, eval_count: 10 })
		);
		expect(await c('s', 'u')).toEqual({ text: '{"status":"todo"}', tokens: 50 });
	});
	it('reads OpenAI', async () => {
		const c = completer(
			{ provider: 'openai', model: 'm', baseUrl: 'http://h', apiKey: 'k' },
			reply({ choices: [{ message: { content: 'x' } }], usage: { total_tokens: 7 } })
		);
		expect(await c('s', 'u')).toEqual({ text: 'x', tokens: 7 });
	});
	it('reads Anthropic', async () => {
		const c = completer(
			{ provider: 'anthropic', model: 'm', baseUrl: 'http://h', apiKey: 'k' },
			reply({
				content: [{ type: 'text', text: 'y' }],
				usage: { input_tokens: 5, output_tokens: 3 }
			})
		);
		expect(await c('s', 'u')).toEqual({ text: 'y', tokens: 8 });
	});
	it('fails on an error response, without the body', async () => {
		const c = completer(
			{ provider: 'ollama', model: 'm', baseUrl: 'http://h:1', apiKey: null },
			(async () => new Response('secret detail', { status: 500 })) as unknown as typeof fetch
		);
		await expect(c('s', 'u')).rejects.toThrow('http://h:1 500');
	});
});
