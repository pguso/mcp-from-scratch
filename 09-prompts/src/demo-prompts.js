// demo-prompts.js - shared prompt definitions for module 09 servers

/**
 * Register the three tutorial prompts on a PromptRegistry instance.
 *
 * @param {import('./registry.js').PromptRegistry} registry
 */
export function registerDemoPrompts(registry) {
  registry.register(
    {
      name:        'summarize',
      title:       'Summarize text',
      description: 'Summarize the given text in a few sentences.',
      arguments: [
        {
          name:        'text',
          description: 'Text to summarize',
          required:    true,
        },
      ],
    },
    (args) => ({
      description: 'Summarize the given text',
      messages: [
        {
          role:    'user',
          content: {
            type: 'text',
            text: `Summarize the following in 2–3 sentences:\n\n${args.text}`,
          },
        },
      ],
    })
  );

  registry.register(
    {
      name:        'code_review',
      title:       'Request code review',
      description: 'Ask the model to review code quality and suggest improvements.',
      arguments: [
        {
          name:        'code',
          description: 'Source code to review',
          required:    true,
        },
      ],
    },
    (args) => ({
      description: 'Code review prompt',
      messages: [
        {
          role:    'user',
          content: {
            type: 'text',
            text: `Please review this code for clarity, bugs, and improvements:\n\n${args.code}`,
          },
        },
      ],
    })
  );

  registry.register(
    {
      name:        'explain_concept',
      title:       'Explain an MCP concept',
      description: 'Explain a core MCP idea in plain language for a beginner.',
      arguments: [
        {
          name:        'topic',
          description: 'Concept to explain (defaults to "prompts")',
          required:    false,
        },
      ],
    },
    (args) => {
      const topic =
        typeof args.topic === 'string' && args.topic.trim() !== ''
          ? args.topic.trim()
          : 'prompts';

      return {
        description: `Explain ${topic}`,
        messages: [
          {
            role:    'user',
            content: {
              type: 'text',
              text: `Explain "${topic}" in the Model Context Protocol for someone who just finished building tools and resources. Keep it under 200 words.`,
            },
          },
        ],
      };
    }
  );
}
