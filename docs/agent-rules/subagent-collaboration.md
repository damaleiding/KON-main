# 多模型子 Agent 协作规则

## 基本原则

- Trae 当前主模型是统筹者，负责理解用户目标、拆分任务、分配子任务、最终合并、复查和对用户交付。
- 子 Agent 是加速和交叉验证工具，不直接作为最终事实源。
- 任何子 Agent 输出都必须由 Trae 主模型复查、筛选、改写和落盘。
- 不应把密钥、token、cookie、私有账号、未脱敏客户资料或大体积媒体直接发送给子 Agent。
- 子 Agent 产物如果进入文件系统，必须标注来源、用途、时间和是否已由主模型复核。

## 默认子 Agent

- Claude 子 Agent：通过 OneAgent API 调用，默认模型为 `claude-opus-4-7`。适合架构设计、复杂文档、长上下文归纳、prompt 精修、代码审查和高质量改写。
- DeepSeek 子 Agent：通过 Ark API 调用，默认模型为 `deepseek-v4-pro-260425`。适合反方审查、边界条件、测试缺口、鲁棒性、成本风险和实现可行性质疑。

## 环境变量约定

- `ONEAGENT_BASE_URL`：OneAgent API 地址。
- `ONEAGENT_API_KEY`：OneAgent API Key，不得写入仓库。
- `ONEAGENT_MODEL=claude-opus-4-7`。
- `ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3`。
- `ARK_API_KEY`：Ark API Key，不得写入仓库。
- `ARK_MODEL_DEEPSEEK=deepseek-v4-pro-260425`。

## 触发规则

以下任务默认启用子 Agent 协作：

- 新增或重构项目框架、目录规则、工作流规则、同步规则。
- 设计或修改 `AGENTS.md`、`README.md`、`WORKFLOW.md`、`PROJECT.md`、`_pipeline/`。
- 新增工具、封装脚本、设计 schema、账本、索引或 media manifest。
- 迁入外部项目、梳理项目用途、判断资产归类和长期维护边界。
- 编写复杂 prompt 体系、批量生成规则、审稿标准或多窗口协作规范。
- 涉及多个文件、多个目录、长期规则或后续 GitHub 同步边界的任务。
- 用户明确要求“多模型”“并发”“复核”“更稳妥”“让子 Agent 看一下”。

## 分工建议

- 写模块前，Trae 主模型先给出目标、边界、输入输出和验收标准。
- Claude 子 Agent 负责产出主方案、结构化草稿或高质量实现建议。
- DeepSeek 子 Agent 负责挑错、找边界、审查风险和提出反例。
- Trae 主模型最后统一判断，保留正确部分，删除冲突或不适配内容，并运行必要检查。

## 可跳过情况

- 简单路径查询、单文件小修、机械替换、格式调整。
- 用户明确要求快速执行且任务风险低。
- 子 Agent 需要接触密钥、token、cookie、未脱敏客户资料或大体积媒体。
- 当前任务已有明确规则和模板，调用子 Agent 只会增加噪声。
