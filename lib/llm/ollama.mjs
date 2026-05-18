// Ollama Provider — raw fetch, no SDK
// Uses Ollama's native chat API so we can request JSON output and disable thinking.
// No API key required — fully local inference

import { LLMProvider } from './provider.mjs';

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export class OllamaProvider extends LLMProvider {
  constructor(config) {
    super(config);
    this.name = 'ollama';
    this.baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.model || 'llama3.1:8b';
    this.think = parseBoolean(process.env.OLLAMA_THINK, false);
    this.temperature = parseFloat(process.env.OLLAMA_TEMPERATURE || '0.2');
  }

  get isConfigured() { return !!this.model; }

  async complete(systemPrompt, userMessage, opts = {}) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: opts.format || 'json',
        think: this.think,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        options: {
          temperature: this.temperature,
          num_predict: opts.maxTokens || 4096,
        },
      }),
      signal: AbortSignal.timeout(opts.timeout || 120000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Ollama API ${res.status}: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const text = data.message?.content || data.response || '';

    return {
      text,
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
      },
      model: data.model || this.model,
    };
  }
}
