import { buildIrPrompt, fixtureExtractIr, normalizeIr } from './ir.js';

const DEFAULT_OPENAI_MODEL = 'gpt-5.2';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-5.2';

export function createProvider(name, options = {}) {
  if (name === 'fixture') {
    return {
      name,
      async extractIr(source, extractOptions) {
        return fixtureExtractIr(source, extractOptions);
      }
    };
  }

  if (name === 'openai') {
    return createOpenAiProvider(options);
  }

  if (name === 'openrouter') {
    return createOpenRouterProvider(options);
  }

  throw new Error(`Unknown provider: ${name}`);
}

function createOpenAiProvider(options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model = options.model ?? process.env.CAVEMANIZER_MODEL ?? DEFAULT_OPENAI_MODEL;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for --provider openai');
  }

  return {
    name: 'openai',
    async extractIr(source, extractOptions = {}) {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          instructions: SYSTEM_PROMPT,
          input: buildIrPrompt(source, extractOptions),
          text: {
            format: {
              type: 'json_schema',
              name: 'instruction_ir',
              strict: true,
              schema: IR_JSON_SCHEMA
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
      }

      return normalizeIr(parseJsonFromText(extractOpenAiText(await response.json())), extractOptions);
    }
  };
}

function createOpenRouterProvider(options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  const model = options.model ?? process.env.CAVEMANIZER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required for --provider openrouter');
  }

  return {
    name: 'openrouter',
    async extractIr(source, extractOptions = {}) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/gerardkraja/cavemanizer',
          'X-Title': 'cavemanizer'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildIrPrompt(source, extractOptions) }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'instruction_ir',
              strict: true,
              schema: IR_JSON_SCHEMA
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter request failed (${response.status}): ${await response.text()}`);
      }

      const body = await response.json();
      return normalizeIr(parseJsonFromText(body.choices?.[0]?.message?.content ?? ''), extractOptions);
    }
  };
}

function extractOpenAiText(body) {
  if (typeof body.output_text === 'string') return body.output_text;
  const chunks = [];
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n');
}

function parseJsonFromText(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Provider returned empty IR response');
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Provider did not return JSON: ${trimmed.slice(0, 200)}`);
    return JSON.parse(match[0]);
  }
}

const SYSTEM_PROMPT = `You compress agent skills into Instruction-IR.
Be terse. Preserve hard requirements. Keep exact commands, paths, URLs, env vars, and inline code.
Return JSON only.`;

const IR_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'title', 'description', 'triggers', 'rules', 'workflow', 'examples', 'references', 'omissions', 'sourceName'],
  properties: {
    name: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    triggers: { type: 'array', items: { type: 'string' } },
    rules: { type: 'array', items: { type: 'string' } },
    workflow: { type: 'array', items: { type: 'string' } },
    examples: { type: 'array', items: { type: 'string' } },
    references: { type: 'array', items: { type: 'string' } },
    omissions: { type: 'array', items: { type: 'string' } },
    sourceName: { type: 'string' }
  }
};
