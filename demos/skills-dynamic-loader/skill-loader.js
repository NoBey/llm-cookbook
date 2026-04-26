import { readdir } from "fs/promises";
import { pathToFileURL, fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * SkillLoader
 *
 * 从指定目录动态加载所有 skill 模块，每个模块需导出：
 *   - definition: OpenAI tool definition 对象
 *   - execute(params): 异步执行函数，返回字符串
 */
export class SkillLoader {
  /** @type {Map<string, { definition: object, execute: Function }>} */
  #skills = new Map();

  /**
   * 从目录加载所有 .js skill 文件
   * @param {string} skillsDir - skills 目录路径（相对或绝对）
   */
  async load(skillsDir = "./skills") {
    const resolvedDir = join(__dirname, skillsDir);
    const files = await readdir(resolvedDir);
    const jsFiles = files.filter((f) => f.endsWith(".js"));

    const loadResults = await Promise.allSettled(
      jsFiles.map((file) => this.#loadSkillFile(join(resolvedDir, file), file))
    );

    loadResults.forEach((result, i) => {
      if (result.status === "rejected") {
        console.warn(`[SkillLoader] 加载失败: ${jsFiles[i]} —`, result.reason.message);
      }
    });

    console.log(`[SkillLoader] 已加载 ${this.#skills.size} 个 skills: ${[...this.#skills.keys()].join(", ")}`);
    return this;
  }

  /**
   * 动态 import 单个 skill 文件并注册
   */
  async #loadSkillFile(filePath, fileName) {
    const module = await import(pathToFileURL(filePath).href);

    if (!module.definition || typeof module.execute !== "function") {
      throw new Error(`${fileName} 缺少 definition 或 execute 导出`);
    }

    const name = module.definition?.function?.name;
    if (!name) {
      throw new Error(`${fileName} 的 definition.function.name 未定义`);
    }

    this.#skills.set(name, {
      definition: module.definition,
      execute: module.execute,
    });
  }

  /**
   * 手动注册一个 skill（运行时热插拔）
   * @param {{ definition: object, execute: Function }} skill
   */
  register(skill) {
    const name = skill.definition?.function?.name;
    if (!name) throw new Error("skill.definition.function.name 未定义");
    this.#skills.set(name, skill);
    console.log(`[SkillLoader] 动态注册 skill: ${name}`);
    return this;
  }

  /**
   * 卸载指定 skill
   * @param {string} name
   */
  unregister(name) {
    const removed = this.#skills.delete(name);
    if (removed) console.log(`[SkillLoader] 已卸载 skill: ${name}`);
    return this;
  }

  /**
   * 获取所有 skill 的 OpenAI tool definitions 列表
   * @returns {object[]}
   */
  getTools() {
    return [...this.#skills.values()].map((s) => s.definition);
  }

  /**
   * 根据 tool_call 执行对应 skill
   * @param {{ function: { name: string, arguments: string } }} toolCall
   * @returns {Promise<string>} skill 执行结果（字符串）
   */
  async dispatch(toolCall) {
    const { name, arguments: argsStr } = toolCall.function;
    const skill = this.#skills.get(name);

    if (!skill) {
      return JSON.stringify({ error: `未找到 skill: ${name}` });
    }

    try {
      const params = JSON.parse(argsStr);
      const result = await skill.execute(params);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: `skill [${name}] 执行失败: ${err.message}` });
    }
  }

  /** 查看已注册的 skill 列表 */
  list() {
    return [...this.#skills.keys()];
  }
}
