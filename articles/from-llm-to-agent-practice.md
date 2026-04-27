# 原理、接口、思考

---

## 引子：一个例子

---

## 第一章：LLM的原理,训练,工程 

### 1.1 模型的本质 
**下一个 token 的预测器。**

### 1.2 如何让具有智能
- 预训练
  - BEP 机制处理数据,计算 tokenizer 
  - 基于 Transformer 架构的深度神经网络进行学习建模
    - 注意力机制（Attention）注意力机制决定上下文长度 


### 1.3 如何让模型学会对话
**SFT（监督微调）**：用标注好的"问题-回答"对继续训练预训练模型。
 - 和预训练更新模型权重的方式完全一样
 - 数据不同，目标不同


### 1.4 如何学会推理
单靠 SFT 不够，推理能力需要 RL（强化学习）后训练：
- RL  
  - 让模型通过自己采样 → 获取奖励 → 更新策略来主动学习，
- GRPO 
  -  GRPO 的本质是策略梯度强化学习，模型对同一道题自由采样多条输出，由奖励函数对每条输出打分，组内减均值得到相对优势，再将优势作为权重缩放每条序列的 log 概率，构造出加权 NLL loss，最后和预训练完全一样地反向传播更新权重——区别不在于 backward 机制，而在于 loss 里多了一个奖励驱动的缩放系数：答得好的序列梯度推着模型概率往上走，答得差的往下压。



> 预训练阶段各家差距已不大。现阶段模型的 agent 能力差距，主要来自后训练阶段的 RL 数据质量和训练策略。

### 1.5 如何把模型部署到生产环境

**ChatML 格式**
```
<|im_start|>system
你是一个助手
<|im_end|>
<|im_start|>user
今天天气怎么样？
<|im_end|>
<|im_start|>assistant
```
API 层将这个格式序列化为 JSON，流式输出时通过 SSE 逐 token 推送。

**推理服务**：
- **ollama**：本地部署，开发调试用
- **vllm**：生产级高吞吐推理，支持连续批处理（Continuous Batching）


**KV 缓存**：Attention 计算中 K、V 矩阵可以缓存复用，避免重复计算相同的上下文前缀。长 system prompt 建议固定，充分利用缓存。



### 1.6 一个完成的从预训练到chat部署的项目

- https://github.com/karpathy/nanhttps://github.com/karpathy/nanochat.gitochat


> 大模型的训练目前就是资本密集型行业，有卡有算力才能快速迭代和验证


---

## 第二章：llm api, Agent, 工具链

### 2.1 LLM api 格式


**OpenAI 格式**已成为事实标准，几乎所有推理服务都兼容：

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "你是一个助手" },
    { "role": "user", "content": "北京天气怎么样？" }
  ],
  "tools": [...],
  "stream": true
}
```

- OpenAI 格式
   - https://platform.openai.com/docs/api-reference/chat/create
   - https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
   - https://model-spec.openai.com/2025-02-12.html#chain_of_command
- Claude 格式
  - https://platform.claude.com/docs/en/build-with-claude/working-with-messages

**role 优先级**：`system` > `user` > `assistant`。模型通常更信任 system 层的指令，但这不是绝对的——强烈的 user 指令可以覆盖 system 的软约束


**推理强度**：
- `temperature`：越高越随机，创意写作用高值，代码/工具调用用低值（0~0.2）
- `thinking` / `reasoning_effort`：部分模型支持显式控制推理深度，换时间换精度，底层原理就是拼接提示词，只不过是官方拼接


### 2.2 loop & agent & harness
【暂时先不写】

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

> 完整代码见 [`demos/skills-dynamic-loader/`](../demos/skills-dynamic-loader/)


---

## 第三章：使用 llm 思维方式

### 3.1 出现一个行为或者现象，从agent层到模型层去思考为什么
**例子**： cladue code 使用中文输入，但是模型回复的是英文
- **Agent层**：拦截实际发出的 API 请求，检查 messages 里有没有英文指令、英文示例把模型"带偏"了
- **模型层**：：检查 api 的 thinking 过程，模型在后训练RL的时候使用的数据集可能是英文的，导致推理过程产生更多英语，进而导致输出 content 是英文

### 3.2 模型的调用可以理解为一个作为纯函数

尽管 LLM 的输出具有随机性（Temperature > 0），但可以通过基于 seed 的确定性的伪随机算法模拟，因此我们总体上可将其视为一个 Pure Function（纯函数）。

- 输入：历史上下文（Context）
- 输出：文本流（包含思考或工具调用请求）

LLM 本身不直接（也没有能力）产生副作用（Side Effects），它只负责“计算”出下一步的意图。

模型层 context += f(context) 
应用层 context += f(context) + tools(context) 

> 参考文章 https://mp.weixin.qq.com/s/daZZsNPg6Ieha3Wv-R3hWg

### 3.3 逻辑和知识分离

**逻辑通常不会错，知识可能是错的。**
 
例如:  

![1.png](../img/1.png) 

洗车问题：让模型帮你规划"去洗车"，它可能建议你推着车去，或者走路去。这不是推理出了问题，而是模型缺少"洗车需要开车去"这个常识——因为这个知识在训练数据里不够显著。

模型的知识来自训练语料，而语料对真实世界的覆盖是不均匀的。遇到"奇怪的错误"，先检查是不是知识缺失，而不是质疑模型的推理能力。

### 3.4 LLM的输出是有真的创新吗？
  - LLM的输出是基于历史上下文和逻辑推理的，并不是真正的创新
  - 好的输入才能产生好的输出，上下文的丰富程度越高越好


---

## 第四章：实践的技巧

### 4.1 控制 tools 数量
tools 列表过长，模型的"选择困难"会上升，调用准确率下降，延迟增加（tool definitions 占 token）。

**原则**：每次只注册当前任务相关的 tools，不要把所有 skills 全部挂载。动态注册比静态挂载更灵活。

### 4.2 控制上下文长度 
context 越长：推理越慢、成本越高、模型对早期内容的"注意力"越稀薄（Lost in the Middle 问题）。

**策略**：
- 长对话做滚动摘要，替换掉早期的原始消息
- tool 返回结果做精简，只保留 LLM 下一步需要的字段
- 善用 KV 缓存：固定 system prompt，减少重复计算


### 4.3 事实验证
api 检查 必须要 保障对应 版本中存在对应 API 


### 4.4 使用语音，文本混合输入，不需要严谨，但是需要完整
实践中发现：**不需要严谨，但需要完整。**

语音输入口语化、有歧义没关系，但信息要完整——背景、目标、约束都说清楚。模型有很强的意图识别能力，但它无法凭空补全你没说的约束条件。

### 4.5 不要让模型做决定

模型可以"建议"，但**执行前要有人（或规则系统）确认**。

特别是不可逆操作：删除文件、发送消息、提交代码、扣款。把这类 tool 设计成"需要二次确认"，而不是 LLM 一次推理直接执行完毕。

> agent 出问题，往往不是模型不够聪明，而是给了它太大的权限和太少的约束。



---

## 总结


---

