/**
 * Skill: calculator
 * 四则运算计算器
 */

export const definition = {
  type: "function",
  function: {
    name: "calculator",
    description: "执行基础数学运算（加减乘除）",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "数学表达式，例如：(10 + 5) * 2 / 3",
        },
      },
      required: ["expression"],
    },
  },
};

export async function execute({ expression }) {
  // 安全地只允许数字和运算符
  if (!/^[\d\s\+\-\*\/\(\)\.]+$/.test(expression)) {
    return JSON.stringify({ error: "非法表达式，只允许数字和 + - * / ( )" });
  }

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expression})`)();
    return JSON.stringify({ expression, result });
  } catch {
    return JSON.stringify({ error: "计算失败，请检查表达式格式" });
  }
}
