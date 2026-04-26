/**
 * Skill: search_knowledge
 * 模拟知识库搜索（可替换为真实的向量检索或 RAG 逻辑）
 */

export const definition = {
  type: "function",
  function: {
    name: "search_knowledge",
    description: "在知识库中搜索相关信息，返回最相关的内容片段",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词或问题",
        },
        top_k: {
          type: "number",
          description: "返回最相关的前 k 条结果，默认 3",
        },
      },
      required: ["query"],
    },
  },
};

const KNOWLEDGE_BASE = [
  {
    id: 1,
    title: "OpenAI Tool Calling",
    content: "OpenAI 的 function calling 允许模型调用外部工具，通过 tools 参数传入工具定义，模型返回 tool_calls 字段。",
    tags: ["openai", "tools", "function calling"],
  },
  {
    id: 2,
    title: "Agent Loop 原理",
    content: "Agent Loop 是一个循环：用户输入 → LLM 推理 → 工具调用 → 结果回填 → LLM 继续推理，直到 finish_reason 为 stop。",
    tags: ["agent", "loop", "reasoning"],
  },
  {
    id: 3,
    title: "Skill 动态加载",
    content: "通过读取 skills 目录下的模块文件，动态 import 并注册到 tools 列表，使 agent 能够按需调用不同能力。",
    tags: ["skill", "dynamic", "plugin"],
  },
];

export async function execute({ query, top_k = 3 }) {
  // 简单关键词匹配（生产中替换为向量相似度搜索）
  const keywords = query.toLowerCase().split(/\s+/);
  const scored = KNOWLEDGE_BASE.map((doc) => {
    const text = `${doc.title} ${doc.content} ${doc.tags.join(" ")}`.toLowerCase();
    const score = keywords.filter((kw) => text.includes(kw)).length;
    return { ...doc, score };
  });

  const results = scored
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top_k)
    .map(({ id, title, content }) => ({ id, title, content }));

  return JSON.stringify({ query, results: results.length ? results : [{ message: "未找到相关内容" }] });
}
