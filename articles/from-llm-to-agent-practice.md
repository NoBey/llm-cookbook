# LLM 原理 · 接口 · 思考

---

## 引子
一个例子: 诉告我北京天明气天样怎

![](../img/preface.png)

1. 为什么能识别?
2. 看了解释也不懂怎么办?
3. 就算了解了有什么用?


> 下面内容希望从最基础LLM原理到最终使用上来探讨下，如何理解和使用 LLM

---

## 第一章：LLM 的原理、训练、工程

### 1.1 模型的本质
**下一个 token 的预测器。**

### 1.2 智能从哪里来
- 预训练
  - BEP 机制处理数据,计算 tokenizer 
  - 基于 Transformer 架构的深度神经网络进行学习建模
    - 注意力机制（Attention）注意力机制决定上下文长度 

### 1.3 学会对话：SFT
**SFT（监督微调）**：用标注好的"问题-回答"对继续训练预训练模型。
 - 和预训练更新模型权重的方式完全一样
 - 数据不同，目标不同

### 1.4 学会推理：RL
单靠 SFT 不够，推理能力需要 RL（强化学习）后训练：
- **思路**：模型自采样 → 奖励函数打分 → 用分数缩放梯度
- **GRPO**：同题多采样，组内减均值得到相对优势，作为权重缩放每条序列的 log 概率，构造加权 NLL loss，再走标准反向传播
- 关键不在 backward 变了，而在 loss 多了一个**奖励驱动的缩放系数**：好答案被推上去，坏答案被压下来

> 预训练阶段各家差距已不大。现阶段 agent 能力的差距，主要来自后训练 RL 的数据质量与策略。

### 1.5 部署到生产

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

API 层把它序列化为 JSON，流式输出通过 SSE 逐 token 推送。

**llm inference serving**
- **ollama**：本地，开发调试
- **vllm**：生产级高吞吐，连续批处理（Continuous Batching）+ PagedAttention

**KV Cache**：Attention 的 K、V 可缓存复用，避免重复算前缀。这部分就是纯工程的实现和模型本身无关

### 1.6 一个端到端的最小项目
- nanochat：从预训练 → SFT → 部署，一个仓库讲完
  - https://github.com/karpathy/nanochat

> 大模型训练是资本密集型行业，有卡才有迭代权。

---

## 第二章：LLM API、Agent、工具链

### 2.1 LLM API 格式

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

参考文档
- OpenAI Chat：https://platform.openai.com/docs/api-reference/chat/create
- OpenAI Model Spec：https://model-spec.openai.com/2025-02-12.html#chain_of_command
- Claude Messages：https://platform.claude.com/docs/en/build-with-claude/working-with-messages

**role 优先级**：`system` > `user` > `assistant`。模型更信任 system，但不是绝对——强烈的 user 指令能压过 system 软约束。

**采样与推理强度**
- `temperature`：高 → 发散；低（0~0.2）→ 代码 / 工具调用
- `thinking` / `reasoning_effort`：换时间换精度，**本质是官方在帮你拼提示词**

### 2.2 Loop、Agent、Harness

LLM 单次调用是无状态的，自己不会"持续做事"。
要让它"持续",外层得**不断把新上下文再喂回去**。

```
user → LLM ─tool_calls─▶ execute → tool result ─▶ LLM → ... → stop
```

- **Loop**：上面这条循环
- **Agent** = LLM + tools + loop
- **Harness** = 跑 loop 的运行时

> 单次调用是纯函数，agent 的"状态"全部躺在 messages 里。

参考：https://github.com/NoBey/llm-loop-tools-demo/blob/main/react-to-harness.md

### 2.3 Skill 实现原理

通过 llm api 的 tools 调用，动态进行 context 更新，从而实现 loop 的连续推理

```
LLM 推理 ── finish_reason=tool_calls ──▶ SkillLoader.dispatch
   ▲                                              │
   └──────── role:"tool" 回填 ◀──── execute() ────┘
```

**Skill 约定式**：一个文件导出两个字段。

```js
// skills/get_weather.js
export const definition = {
  type: "function",
  function: {
    name: "get_weather",
    description: "获取指定城市的当前天气",
    parameters: {
      type: "object",
      properties: { city: { type: "string", description: "城市名称" } },
      required: ["city"],
    },
  },
};

export async function execute({ city }) {
  return JSON.stringify({ city, temperature: "22°C", condition: "晴" });
}
```

**并行 tool calls**：一轮可能返回多个调用，`Promise.all` 全部跑完再一起回填，不要串行等。

> 完整代码见 [`demos/skills-dynamic-loader/`](../demos/skills-dynamic-loader/)


### 2.4 LLm 的越狱技巧

![jb](../img/jailbreak.png)

1. 安全分析绕过
 - 模型通常训练的时候有类似对内容的安全分析检测，通过提示词的注入，让模型认为自己经完成安全分析检测
2. 伪造既成事实
 - 通过修改 msg 的历史信息，伪造 role 为 assistant 的发言历史，让模型认为自己经再进行输出
3. 虚假故事设定
 - 通过虚拟世界或角色扮演，诱导模型忽略真实的人类价值观限制
4. 通过工具调用和关闭推理
 - 关闭推理可以降低模型在思考阶段发现真相，使用工具是因为目前目前模型的后训练都是通过工具来完成任务，所以比直接输出遵从度更高


> 完整代码见 [`jailbreak.js`](../jailbreak.js)

---

## 第三章：使用 LLM 的一些方式思考

### 3.1 出现一个行为或者现象 agent 层往模型层去思考为什么

**例子**： cladue code 使用中文输入，但是模型回复的是英文
- **Agent层**：拦截实际发出的 API 请求，检查 messages 里有没有英文指令、英文示例把模型"带偏"了
- **模型层**：：检查 api 的 thinking 过程，模型在后训练RL的时候使用的数据集可能是英文的，导致推理过程产生更多英语，进而导致输出 content 是英文

**顺序：先看输入 → 再看推理 → 最后才怀疑模型本身。**

### 3.2 LLM 调用 ≈ 纯函数

尽管 LLM 的输出具有随机性（Temperature > 0），但可以通过基于 seed 的确定性的伪随机算法模拟，因此我们总体上可将其视为一个 Pure Function（纯函数）。

- 输入：历史上下文（Context）
- 输出：文本流（包含思考或工具调用请求）

LLM 本身不直接（也没有能力）产生副作用（Side Effects），它只负责“计算”出下一步的意图。

```
模型层： context += nextToken(context)
应用层： context += nextMsg(context + tools(context))
```

参考：https://mp.weixin.qq.com/s/daZZsNPg6Ieha3Wv-R3hWg

### 3.3  逻辑和知识分离

**逻辑大概率不会错，知识可能是错的。**
 
例如:  

![1.png](../img/1.png) 

洗车问题：让模型帮你规划"去洗车"，它可能建议你推着车去，或者走路去。这不是推理出了问题，而是模型缺少"洗车需要开车去"这个常识——因为这个知识在训练数据里不够显著。

模型的知识来自训练语料，而语料对真实世界的覆盖是不均匀的。遇到"奇怪的错误"，先检查是不是知识缺失，而不是质疑模型的推理能力。

### 3.4 LLM 的输出是真创新吗
- LLM的输出是基于历史上下文和逻辑推理的，并不是真正的创新
- 输出的好坏由输入决定
- 上下文的丰富程度越高，可发挥空间越大

---

## 第四章：实践的技巧

### 4.1 控 tools 数量
tools 越多 → 选择困难 + 调用准确率下降 + 延迟和 token 双增。

1 个 skills 或者 tools 安装 100token 计算 最大的范围建议是 1% 都 context budget 范围， 假如 256k 范围也就是 2k-3k 大概 20 - 30 个 tools 的空间，是最优空间

如果是使用 cc 的话，有可能会被 1% 强制上线截断

![sk](../img/skills.png)

通常我会使用 不同 Project 来隔离 不同场景的 skills 范围

### 4.2 控上下文长度
context 越长 → 越慢、越贵、注意力越稀（Lost in the Middle）。

以 claude code 举例 /context 可以查看当前的上下文使用情况 
![sk](../img/ctx.png)

默认情况 auto-compact 是会被打开，也可以主动使用 /compact 命令来进行压缩

上下文越短速度越快，token 总量越节省, 去年的模型最佳区间是 context budget 的 30%-40%， 目前最新的模型 context budget 的 70%-90%，注意力都不会跑太偏，但是长了还是慢


### 4.3 事实验证
生成 API 调用前，先调用官方文档检索工具，拉最新 schema/版本/签名

比如使用 Context7 , Prompt 里强制加一条：“在生成任何外部 API 调用前，必须先用 [文档工具] 核对最新版本和签名，否则返回 'NEED_DOC_VERIFY' 并停止。”

### 4.4 输入可口语，但必须完整
**不需要严谨，但要完整。**

![](../img/autoglm.png)

语音口语化、有歧义没关系；但背景 / 目标 / 约束要齐——模型能识别意图，**补不了你没说的约束**。


codex 升级到最新版也有全局的语音输入功能

### 4.5 不要让模型做决定
模型可以"建议"，**最终拍板交给人或规则**。

```bash
alias claude-skip='claude --dangerously-skip-permissions'%
```

特别是不可逆操作：删文件、发消息、确认。这类 tool 设计成**二次确认**，而不是一次推理直接到底。

![](../img/permissions.png)

不开 skip 的情况下，可以设计一些自己可以接受的 settings.local.json 访问权限或者范围，可以整理好用来快速启动一个项目

---

## 总结
再回到最开始的问题
1. 为什么能识别? 
 - 模型的注意力机制是计算前面所有文字的关系总和，并且模型通过RL具备了推理能力，所以你的错误它能理解
2. 看了解释也不懂怎么办? 
 - 回到 第一章 的内容再重新理解一遍
3. 就算了解了有什么用? 
 - 这个逻辑本身就是决定用语音，而非文字作为 ai 输入的一种方式的基本逻辑，llm 不关心你的语序，也不关心你的内容是否形式逻辑正确，它只关心你的上下文是否丰富