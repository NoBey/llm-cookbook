/**
 * Skills 动态加载 Demo
 *
 * 运行前设置环境变量：
 *   export OPENAI_API_KEY=sk-xxx
 *   export OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，兼容其他提供商
 *   export MODEL=gpt-4o-mini                          # 可选
 */

import { SkillLoader } from "./skill-loader.js";
import { Agent } from "./agent.js";

async function main() {
  // ① 动态加载 skills 目录下所有 skill
  const skillLoader = new SkillLoader();
  await skillLoader.load("../../.claude/skills");

  // ② 运行时动态注册额外 skill（热插拔示例）
  skillLoader.register({
    definition: {
      type: "function",
      function: {
        name: "get_current_time",
        description: "获取当前的日期和时间",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    execute: async () => JSON.stringify({ datetime: new Date().toLocaleString("zh-CN") }),
  });

  console.log("\n已注册的 skills:", skillLoader.list());

  // ③ 创建 Agent
  const agent = new Agent({
    apiKey: process.env.OPENAI_API_KEY ?? "your-api-key",
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.MODEL ?? "gpt-4o-mini",
    skillLoader,
  });

  const systemMessages = [
    {
      role: "system",
      content: "你是一个智能助手，能调用多种工具帮助用户解决问题。请尽量综合使用工具给出完整的回答。",
    },
  ];

  // ④ 测试对话
  const queries = [
    "北京今天天气怎么样？现在几点了？",
    "(123 + 456) * 2 等于多少？",
    "帮我查一下 agent loop 是什么",
  ];

  for (const query of queries) {
    console.log("\n" + "=".repeat(60));
    console.log(`用户: ${query}`);
    const answer = await agent.run(query, systemMessages);
    console.log(`助手: ${answer}`);
  }
}

main().catch(console.error);
