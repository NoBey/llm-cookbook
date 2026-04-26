import OpenAI from "openai";
import { SkillLoader } from "./skill-loader.js";

/**
 * Agent
 *
 * 基于 OpenAI Chat Completions 的 tool-calling 循环。
 * 流程：
 *   用户消息 → LLM 推理 → tool_calls → SkillLoader.dispatch → 结果回填 → 循环
 *   直到 finish_reason === "stop"
 */
export class Agent {
  #client;
  #skillLoader;
  #model;
  #maxIterations;

  /**
   * @param {object} options
   * @param {string} options.apiKey       - OpenAI API Key
   * @param {string} [options.baseURL]    - 自定义 base URL（兼容 ollama/vllm 等）
   * @param {string} [options.model]      - 模型名称
   * @param {SkillLoader} options.skillLoader
   * @param {number} [options.maxIterations] - 最大工具调用轮数，防止死循环
   */
  constructor({ apiKey, baseURL, model = "gpt-4o-mini", skillLoader, maxIterations = 10 }) {
    this.#client = new OpenAI({ apiKey, baseURL });
    this.#model = model;
    this.#skillLoader = skillLoader;
    this.#maxIterations = maxIterations;
  }

  /**
   * 运行一次对话（支持多轮工具调用）
   * @param {string} userMessage
   * @param {object[]} [systemMessages] - 可选的 system 消息
   * @returns {Promise<string>} 最终回复文本
   */
  async run(userMessage, systemMessages = []) {
    const messages = [
      ...systemMessages,
      { role: "user", content: userMessage },
    ];

    const tools = this.#skillLoader.getTools();
    let iterations = 0;

    while (iterations < this.#maxIterations) {
      iterations++;

      console.log(`\n[Agent] 第 ${iterations} 轮推理，messages 长度: ${messages.length}`);

      const response = await this.#client.chat.completions.create({
        model: this.#model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
      });

      const choice = response.choices[0];
      const assistantMsg = choice.message;

      // 将 assistant 消息加入上下文
      messages.push(assistantMsg);

      // 结束条件：模型不再调用工具
      if (choice.finish_reason === "stop" || !assistantMsg.tool_calls?.length) {
        console.log(`[Agent] 推理完成，共 ${iterations} 轮`);
        return assistantMsg.content ?? "";
      }

      // 并行执行所有 tool_calls
      console.log(`[Agent] 调用工具: ${assistantMsg.tool_calls.map((tc) => tc.function.name).join(", ")}`);

      const toolResults = await Promise.all(
        assistantMsg.tool_calls.map(async (toolCall) => {
          const result = await this.#skillLoader.dispatch(toolCall);
          console.log(`[Agent]   └─ ${toolCall.function.name}(${toolCall.function.arguments}) → ${result}`);
          return {
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          };
        })
      );

      // 将工具结果回填到消息列表
      messages.push(...toolResults);
    }

    throw new Error(`[Agent] 超过最大迭代次数 (${this.#maxIterations})，终止`);
  }

  /**
   * 流式运行（SSE stream），暂不处理 tool_calls 的流式拼接，
   * 直接复用非流式接口后再 yield 文字内容
   */
  async *stream(userMessage, systemMessages = []) {
    const result = await this.run(userMessage, systemMessages);
    for (const char of result) {
      yield char;
    }
  }
}
