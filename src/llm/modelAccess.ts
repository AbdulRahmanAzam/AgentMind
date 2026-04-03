import * as vscode from 'vscode';
import { ToolCallResult } from '../types.js';
import { Logger } from '../utils/logger.js';

/** Maximum number of tool-call round-trips before the agent loop terminates. */
const MAX_ITERATIONS = 25;

/** Number of recent messages to keep when auto-truncating for context limits. */
const TRUNCATE_KEEP = 20;

/**
 * Wraps the VS Code Language Model API for per-agent LLM interactions.
 *
 * Each agent gets an `AgentLLM` instance that manages its own
 * conversation history, system prompt, and tool definitions.
 */
export class AgentLLM {
  private readonly agentId: string;
  private systemPrompt: string;
  private readonly tools: vscode.LanguageModelChatTool[];
  private readonly history: vscode.LanguageModelChatMessage[] = [];
  private model: vscode.LanguageModelChat | null = null;

  constructor(
    agentId: string,
    systemPrompt: string,
    tools: vscode.LanguageModelChatTool[],
  ) {
    this.agentId = agentId;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
  }

  // ─── Model selection ──────────────────────────────────────────

  /**
   * Discover and return an available chat model.
   *
   * @param preferredFamily - Optional model family filter (e.g. `'gpt-4o'`).
   * @returns The first matching `LanguageModelChat`.
   * @throws If no models are available.
   */
  static async selectModel(
    preferredFamily?: string,
  ): Promise<vscode.LanguageModelChat> {
    const selector: vscode.LanguageModelChatSelector = preferredFamily
      ? { family: preferredFamily }
      : {};

    const models = await vscode.lm.selectChatModels(selector);

    if (models.length === 0) {
      throw new Error(
        preferredFamily
          ? `No language models found for family "${preferredFamily}". Ensure a Copilot-compatible model is available.`
          : 'No language models found. Ensure GitHub Copilot or another LM provider is active.',
      );
    }

    const model = models[0];
    Logger.info(`LLM model selected: ${model.name} (${model.id})`);
    return model;
  }

  /** Assign the shared model instance to this agent. */
  setModel(model: vscode.LanguageModelChat): void {
    this.model = model;
  }

  // ─── Conversation management ──────────────────────────────────

  /** Number of messages in the conversation history (excluding system). */
  getMessageCount(): number {
    return this.history.length;
  }

  /**
   * Keep only the last `keepLast` messages in history.
   * The system prompt is always preserved (it's kept separately).
   */
  truncateHistory(keepLast: number): void {
    if (this.history.length > keepLast) {
      const removed = this.history.length - keepLast;
      this.history.splice(0, removed);
      Logger.debug(
        `[${this.agentId}] History truncated: removed ${removed} messages, kept ${keepLast}`,
      );
    }
  }

  /** Append additional context to the system prompt (e.g. AGENTMIND.md). */
  addSystemContext(context: string): void {
    this.systemPrompt += '\n\n' + context;
  }

  // ─── Request / response ───────────────────────────────────────

  /**
   * Send a single request to the model and return the raw streaming response.
   */
  async sendRequest(
    userMessage: string,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelChatResponse> {
    if (!this.model) {
      throw new Error(`[${this.agentId}] Model not set — call setModel() first.`);
    }

    this.history.push(
      vscode.LanguageModelChatMessage.User(userMessage),
    );

    const messages = this.buildMessages();

    Logger.debug(
      `[${this.agentId}] Sending request: ${messages.length} messages, prompt length ~${userMessage.length}`,
    );

    return this.model.sendRequest(messages, { tools: this.tools }, token);
  }

  // ─── The core agent loop ──────────────────────────────────────

  /**
   * The core agent loop: send a message, process tool calls, loop.
   *
   * Sends `userMessage` to the LLM, iterates over the streaming
   * response, invokes any requested tools, feeds results back, and
   * repeats until the model produces a pure-text response or the
   * iteration cap (`MAX_ITERATIONS`) is reached.
   *
   * @param userMessage - The initial prompt/instruction for this turn.
   * @param toolHandlers - Map of tool-name → handler function.
   * @param token - Cancellation token from VS Code.
   * @param onStream - Optional callback for each text chunk (for live UI).
   * @param onToolCall - Optional callback when a tool is invoked.
   * @returns The final accumulated text response.
   */
  async runAgentLoop(
    userMessage: string,
    toolHandlers: Map<string, (input: unknown) => Promise<ToolCallResult>>,
    token: vscode.CancellationToken,
    onStream?: (text: string) => void,
    onToolCall?: (toolName: string, input: unknown) => void,
  ): Promise<string> {
    if (!this.model) {
      throw new Error(`[${this.agentId}] Model not set — call setModel() first.`);
    }

    // Push the initial user message
    this.history.push(
      vscode.LanguageModelChatMessage.User(userMessage),
    );

    let finalText = '';

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (token.isCancellationRequested) {
        Logger.debug(`[${this.agentId}] Cancelled at iteration ${iteration}`);
        break;
      }

      const messages = this.buildMessages();

      Logger.debug(
        `[${this.agentId}] Loop iteration ${iteration + 1}/${MAX_ITERATIONS}, ${messages.length} messages`,
      );

      let response: vscode.LanguageModelChatResponse;
      try {
        response = await this.model.sendRequest(
          messages,
          { tools: this.tools },
          token,
        );
      } catch (err) {
        if (err instanceof vscode.LanguageModelError) {
          return this.handleModelError(err, finalText);
        }
        throw err;
      }

      // Collect parts from the stream
      let iterationText = '';
      const toolCalls: { callId: string; name: string; input: object }[] = [];

      try {
        for await (const part of response.stream) {
          if (token.isCancellationRequested) {
            break;
          }

          if (part instanceof vscode.LanguageModelTextPart) {
            iterationText += part.value;
            onStream?.(part.value);
          } else if (part instanceof vscode.LanguageModelToolCallPart) {
            toolCalls.push({
              callId: part.callId,
              name: part.name,
              input: part.input as object,
            });
          }
        }
      } catch (err) {
        if (err instanceof vscode.LanguageModelError) {
          return this.handleModelError(err, finalText + iterationText);
        }
        throw err;
      }

      // If no tool calls were made, we have the final response
      if (toolCalls.length === 0) {
        finalText += iterationText;

        // Append the assistant's text to history
        this.history.push(
          vscode.LanguageModelChatMessage.Assistant(iterationText),
        );

        Logger.debug(
          `[${this.agentId}] Loop complete after ${iteration + 1} iteration(s), response length: ${finalText.length}`,
        );
        break;
      }

      // ── Tool calls present: build assistant message with tool call parts
      const assistantParts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = [];

      if (iterationText) {
        assistantParts.push(new vscode.LanguageModelTextPart(iterationText));
        finalText += iterationText;
      }

      for (const tc of toolCalls) {
        assistantParts.push(
          new vscode.LanguageModelToolCallPart(tc.callId, tc.name, tc.input),
        );
      }

      this.history.push(
        vscode.LanguageModelChatMessage.Assistant(assistantParts),
      );

      // ── Execute tool calls and build result messages
      const toolResultParts: vscode.LanguageModelToolResultPart[] = [];

      for (const tc of toolCalls) {
        onToolCall?.(tc.name, tc.input);

        const handler = toolHandlers.get(tc.name);
        let result: ToolCallResult;

        if (handler) {
          try {
            result = await handler(tc.input);
            Logger.debug(
              `[${this.agentId}] Tool ${tc.name}: success=${result.success}`,
            );
          } catch (err) {
            result = {
              success: false,
              output: '',
              error: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
              filesModified: [],
            };
            Logger.error(
              `[${this.agentId}] Tool ${tc.name} threw: ${result.error}`,
            );
          }
        } else {
          result = {
            success: false,
            output: '',
            error: `Unknown tool: "${tc.name}". Available tools: ${[...toolHandlers.keys()].join(', ')}`,
            filesModified: [],
          };
          Logger.warn(`[${this.agentId}] Unknown tool called: ${tc.name}`);
        }

        const resultText = result.success
          ? result.output
          : `Error: ${result.error}\n${result.output}`;

        toolResultParts.push(
          new vscode.LanguageModelToolResultPart(tc.callId, [resultText]),
        );
      }

      // Append tool results as a User message
      this.history.push(
        vscode.LanguageModelChatMessage.User(toolResultParts),
      );
    }

    return finalText;
  }

  // ─── Internal helpers ─────────────────────────────────────────

  /**
   * Build the full message array: system prompt (as User) + history.
   */
  private buildMessages(): vscode.LanguageModelChatMessage[] {
    const systemMsg = vscode.LanguageModelChatMessage.User(this.systemPrompt);
    return [systemMsg, ...this.history];
  }

  /**
   * Handle a `LanguageModelError` by auto-truncating or returning
   * a partial result.
   */
  private handleModelError(
    err: vscode.LanguageModelError,
    partialText: string,
  ): string {
    const code = err.code;

    if (code === 'ContextWindowExceeded' || err.message.toLowerCase().includes('context')) {
      Logger.warn(
        `[${this.agentId}] Context window exceeded — auto-truncating history`,
      );
      this.truncateHistory(TRUNCATE_KEEP);
      // Return partial text so the caller can decide how to proceed
      return partialText || '[Context limit reached. History truncated — please retry.]';
    }

    if (code === 'RateLimited' || err.message.toLowerCase().includes('rate')) {
      Logger.warn(`[${this.agentId}] Rate limited by model provider`);
      return partialText || '[Rate limited. Please wait a moment and retry.]';
    }

    Logger.error(
      `[${this.agentId}] LLM error (${code}): ${err.message}`,
    );
    return partialText || `[LLM error: ${err.message}]`;
  }
}
