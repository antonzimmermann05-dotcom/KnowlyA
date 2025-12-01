import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { createChatCompletion } from '@/sdk/api-clients/OpenAIGPTChat';
import type { CreateChatCompletionData } from '@/sdk/api-clients/OpenAIGPTChat';

/**
 * Chat message type
 */
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/**
 * Input for GPT chat completion mutation
 */
export interface GPTChatInput {
  /**
   * Array of messages representing the conversation history
   * At minimum, should include one user message
   */
  messages: ChatMessage[];
  /**
   * Model to use for completion
   * @default "MaaS_4.1"
   */
  model?: string;
}

/**
 * Response from GPT chat completion
 */
export interface GPTChatResponse {
  /**
   * The generated response content from the assistant
   */
  content: string;
  /**
   * Unique identifier for the completion
   */
  id: string;
  /**
   * The model used for the completion
   */
  model: string;
  /**
   * Token usage statistics
   */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /**
   * Why the model stopped generating tokens
   */
  finishReason: 'stop' | 'length' | 'function_call' | 'content_filter' | 'null';
}

/**
 * Hook for generating AI chat completions using OpenAI GPT
 *
 * Use cases:
 * - Generate micro-lessons from extracted text
 * - Create quiz questions based on content
 * - Generate summaries of documents
 * - Create flashcards from learning materials
 * - General purpose chat completions
 *
 * @example
 * ```tsx
 * const chatMutation = useGPTChatMutation();
 *
 * // Generate a summary
 * const generateSummary = async (text: string) => {
 *   const result = await chatMutation.mutateAsync({
 *     messages: [
 *       {
 *         role: 'system',
 *         content: 'You are a helpful assistant that creates concise summaries.',
 *       },
 *       {
 *         role: 'user',
 *         content: `Summarize the following text: ${text}`,
 *       },
 *     ],
 *   });
 *   console.log('Summary:', result.content);
 * };
 *
 * // Generate quiz questions
 * const generateQuiz = async (topic: string) => {
 *   const result = await chatMutation.mutateAsync({
 *     messages: [
 *       {
 *         role: 'system',
 *         content: 'You are a quiz creator. Generate 5 multiple-choice questions.',
 *       },
 *       {
 *         role: 'user',
 *         content: `Create quiz questions about: ${topic}`,
 *       },
 *     ],
 *   });
 *   return result.content;
 * };
 * ```
 */
export function useGPTChatMutation(): UseMutationResult<
  GPTChatResponse,
  Error,
  GPTChatInput
> {
  return useMutation({
    mutationFn: async (input: GPTChatInput): Promise<GPTChatResponse> => {
      // Validate input
      if (!input.messages || !Array.isArray(input.messages) || input.messages.length === 0) {
        throw new Error('At least one message is required');
      }

      // Validate message structure
      for (const message of input.messages) {
        if (!message.role || !message.content) {
          throw new Error('Each message must have a role and content');
        }
        if (!['system', 'user', 'assistant'].includes(message.role)) {
          throw new Error(
            `Invalid message role: ${message.role}. Must be 'system', 'user', or 'assistant'`
          );
        }
      }

      const model = input.model || 'MaaS_4.1';

      // Prepare request data
      const requestData: CreateChatCompletionData = {
        body: {
          model,
          messages: input.messages,
        },
        headers: {
          'X-CREAO-API-NAME': 'OpenAIGPTChat',
          'X-CREAO-API-PATH': '/v1/ai/zWwyutGgvEGWwzSa/chat/completions',
          'X-CREAO-API-ID': '688a0b64dc79a2533460892c',
        },
        url: '/v1/ai/zWwyutGgvEGWwzSa/chat/completions',
      };

      // Make API request
      const response = await createChatCompletion(requestData);

      // Check for API errors
      if (response.error) {
        throw new Error('Chat completion request failed. Please check your API credentials.');
      }

      // Validate response data
      if (!response.data) {
        throw new Error('No response data received from chat completion API');
      }

      const { data } = response;

      // Validate choices array
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('No completion choices returned from API');
      }

      const firstChoice = data.choices[0];

      if (!firstChoice.message || !firstChoice.message.content) {
        throw new Error('No content in completion response');
      }

      // Extract and format response
      return {
        content: firstChoice.message.content,
        id: data.id,
        model: data.model,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        finishReason: firstChoice.finish_reason,
      };
    },
  });
}
