# 待定

---

## 引子：一个例子

---

## 第一章：LLM的原理,训练,工程 

### 1.1 模型的本质 
统计规律的下一个 token 预测器

### 1.2 如何让具有智能
- 预训练
- 注意力机制

### 1.3 如何让模型学会对话
- SFT

### 1.4 如何学会推理

- 奖励模型 
- GRPO PPO
- RL

### 1.5 如何把模型部署到生产环境

- ChatML

模型的 ChatML 输入输出格式， 转换成接口的 json 或者 stream 

ollama 和 vllm 

模型缓存 Kv 缓存




https://github.com/karpathy/nanochat

> 大模型的训练目前就是资本密集型行业，有卡有算力才能搞，预训练部分其实差距都不大，目前这个阶段主要是RL的训练，也就是后训练的能力决定了现有模型的agent能力以及任务执行的效果


---

## 第二章：llm api, Agent, 工具链

### 2.1 LLM api 格式

- OpenAI 格式
   - https://platform.openai.com/docs/api-reference/chat/create
   - https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
   - https://model-spec.openai.com/2025-02-12.html#chain_of_command
- Claude 格式
  - https://platform.claude.com/docs/en/build-with-claude/working-with-messages

role 优先级

推理强度

工具调用

### 2.2 loop & agent & harness



https://github.com/NoBey/llm-loop-tools-demo/blob/main/react-to-harness.md


### 2.3 skill 实现原理

通过 llm api 的 tools 调用，动态进行 context 更新，从而实现 loop 的连续推理

#### 核心数据流

```
用户输入
  ↓
LLM 推理（携带 tools 列表）
  ↓  finish_reason === "tool_calls"
SkillLoader.dispatch(tool_call)   ← 根据名称找到对应 skill 并执行
  ↓  role: "tool" 回填结果
LLM 继续推理
  ↓  finish_reason === "stop"
最终回复
```

#### Skill 模块契约

每个 skill 是一个独立的 `.js` 文件，只需导出两个字段：

```js
// skills/get_weather.js
export const definition = {
  type: "function",
  function: {
    name: "get_weather",
    description: "获取指定城市的当前天气信息",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "城市名称" },
      },
      required: ["city"],
    },
  },
};

export async function execute({ city }) {
  // 调用真实 API 或返回模拟数据
  return JSON.stringify({ city, temperature: "22°C", condition: "晴" });
}
```

`definition` 直接作为 OpenAI `tools` 数组的元素，`execute` 接收 LLM 解析后的参数对象并返回字符串结果。

#### SkillLoader — 动态加载与热插拔

```js
const loader = new SkillLoader();
await loader.load("./skills");          // 扫描目录，动态 import 所有 .js 文件

// 运行时热插拔
loader.register({ definition, execute });   // 注册
loader.unregister("get_weather");           // 卸载

loader.getTools();   // → OpenAI tools 数组，直接传给 API
loader.dispatch(toolCall);  // → 执行 tool_call，返回 string 结果
```

#### Agent Loop — 多轮工具调用

```js
const agent = new Agent({ apiKey, model, skillLoader: loader });
const answer = await agent.run("北京今天天气怎么样？现在几点了？");
```

内部循环：每轮把 `tool_calls` **并行** dispatch，把结果以 `role: "tool"` 追加回 messages，直到 `finish_reason === "stop"`。

> 完整代码见 [`demos/skills-dynamic-loader/`](../demos/skills-dynamic-loader/)




---

## 第三章：使用 llm 思维方式

### 3.1 出现一个行为或者现象，从agent层到模型层去思考为什么
例如：cc 使用中文输入，但是模型回复的是英文
- agent层：拦截所有的 api 检查 单次请求的输入输出，可以确认是否是提示词导致
- 模型层：检查 api 的 thinking 过程，模型在后训练RL的时候使用的数据集可能是英文的，导致推理过程产生更多英语，进而导致输出 content 是英文

### 3.2 模型的调用可以理解为一个作为纯函数

尽管 LLM 的输出具有随机性（Temperature > 0），但可以通过基于 seed 的确定性的伪随机算法模拟，因此我们总体上可将其视为一个 Pure Function（纯函数）。
- 输入：历史上下文（Context）
- 输出：文本流（包含思考或工具调用请求）

LLM 本身不直接（也没有能力）产生副作用（Side Effects），它只负责“计算”出下一步的意图。

模型层 context += f(context) 
应用层 context += f(context) + tools(context) 


https://mp.weixin.qq.com/s/daZZsNPg6Ieha3Wv-R3hWg

### 3.3 逻辑和知识分离
 - 逻辑通常不会错，但是知识可能会错

 [1.png](../img/1.png)
 
 例如: 用洗车问题来说， 为什么会推车或者走着去？
 这并不是逻辑问题，而是知识问题，因为语言模型没有洗车需要车的常识知识，一个模型本身包含了 逻辑和知识，这些逻辑和知识是通过大量人类文本知识拟合出来的，本身没有对真实世界的感受纬度更单一所有会出现类似的错误。

### 3.4 LLM的输出是有真的创新吗？
  - LLM的输出是基于历史上下文和逻辑推理的，并不是真正的创新
  - 好的输入才能产生好的输出


---

## 第四章：实践的技巧

### 4.1 控制 tools 数量


### 4.2 控制上下文长度 



### 4.3 事实验证
api 检查 必须要 保障对应 版本中存在对应 API 


### 4.4 使用语音，文本混合输入，不需要严谨，但是需要完整


### 4.5 不要让模型做决定









---

## 总结


---

