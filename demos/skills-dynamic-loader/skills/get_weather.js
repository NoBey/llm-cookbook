/**
 * Skill: get_weather
 * 每个 skill 导出两个字段：
 *   - definition: OpenAI tool definition（函数描述 + 参数 schema）
 *   - execute(params): 实际执行逻辑，返回字符串结果
 */

export const definition = {
  type: "function",
  function: {
    name: "get_weather",
    description: "获取指定城市的当前天气信息",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "城市名称，例如：北京、上海、广州",
        },
        unit: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "温度单位，默认摄氏度",
        },
      },
      required: ["city"],
    },
  },
};

export async function execute({ city, unit = "celsius" }) {
  // 模拟天气 API 调用
  const mockData = {
    北京: { temp: 22, condition: "晴", humidity: 40 },
    上海: { temp: 26, condition: "多云", humidity: 65 },
    广州: { temp: 30, condition: "阵雨", humidity: 80 },
  };

  const weather = mockData[city] ?? { temp: 20, condition: "未知", humidity: 50 };
  const temp = unit === "fahrenheit" ? (weather.temp * 9) / 5 + 32 : weather.temp;
  const unitLabel = unit === "fahrenheit" ? "°F" : "°C";

  return JSON.stringify({
    city,
    temperature: `${temp}${unitLabel}`,
    condition: weather.condition,
    humidity: `${weather.humidity}%`,
  });
}
