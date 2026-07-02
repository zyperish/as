# AS

AS 是一个给 Codex 工作区使用的本地 Agent Memory 模板，用来在不启动 Web 服务的情况下，提供长期记忆、安全门禁和可复用 AI 工作流。

当你希望一个新的 Codex 工作区从一开始就能记住重要项目事实、执行高风险命令前做拦截、并带有一组本地工作流 Skill 时，可以使用 AS。它是干净模板，不包含私人记忆、服务器凭据、聊天归档或运行态数据。

[English README](README.md)

## 为什么要用

AI 工作中常见的问题很固定：记忆过期、规则忘记用、服务器命令太危险、交接记录不完整。AS 把这些问题对应的本地能力打包在一起：

- 本地 no-port AM 记忆；
- 启动和工具 hook，把规则作为证据加载；
- 对服务器、SSH、Docker、Nginx、数据库、破坏性 Git/本地命令做执行前检查；
- 内置 Skill Gate，让非小任务主动调用对应 skill；
- 用 `.gitignore`、`SECURITY.md` 和本地检查避免把私人运行态数据带进可复用模板。

## 主要功能

- **本地 AM**：运行时把长期项目事实、用户偏好、经验教训和会话总结保存在 `.codex/memory/`。
- **AM-first 工作流**：通过 `am-first.mjs` 记录任务开始、阶段 checkpoint 和收尾。
- **安全门禁**：没有预演和审批时，拦截高风险服务器命令和破坏性本地命令。
- **Skill Gate**：按任务类型主动选择本地 skill，不只依赖聊天上下文。
- **Obsidian 问题记录流程**：包含维护 AI 问题清单、解决记录索引、一个问题一个 md 的工作流 skill。
- **默认不占端口**：AM 和 helper 默认走本地文件或 stdio。
- **模板边界清晰**：运行态记忆、对话归档、审批记录、私钥和私有 Obsidian 内容默认不会进入共享模板。

## 快速开始

把仓库复制或克隆到新工作区后，先运行模板检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
```

查看 AM 状态：

```powershell
node .codex\tools\am-first.mjs status --project-root .
```

开始一次工作会话：

```powershell
node .codex\tools\am-first.mjs start --project-root . --query "initial setup"
```

如果你的 Codex 环境支持 MCP 配置，可以使用 `.mcp.json`。`repo-context` 和 `code-review-graph` 是可选 helper，需要时再生成：

```powershell
.\.codex\tools\install-project-mcp.ps1 -Force
```

生成后先检查 `.mcp.json`，确认没有引入不需要的端口、服务或私有绝对路径。

## 工作方式

AS 是放在 Codex 工作区里的模板层：

1. `.codex/hooks.json` 连接启动、用户输入、工具调用前后、归档和停止 hook。
2. `.codex/tools/am-local-store.mjs` 维护本地 AM 存储，运行态文件被 Git 忽略。
3. `.codex/tools/am-first.mjs` 提供 status、start、stage、finish、recall、reflect 等统一入口。
4. `.codex/server-tool-policy.json` 定义哪些命令必须预演审批或直接阻断。
5. `.codex/skills/` 给后续 AI 提供调试、AM 修复、CCOW 协作、问题记录、GitHub README、交接等流程。

## 仓库结构

```text
.codex/
  hooks/                  Codex hook 脚本和测试
  skills/                 本地工作流 Skill
  tools/                  AM、MCP、安全和辅助工具
  server-tool-policy.json 高风险命令策略
scripts/                  readiness、AM、viewer、preflight 脚本
docs/                     AS 模板仓库维护者检查清单
README.md                 英文项目说明
README.zh-CN.md           中文说明
SECURITY.md               私有数据边界说明
THIRD_PARTY_NOTICES.md    来源和许可证说明
```

## 故意不包含什么

这些内容不属于可复用模板，不要复制进共享模板版本：

- `.codex/memory/**`
- `.codex/conversation-archive/**`
- `.codex/server-preflight/**`
- `.codex/tmp/**`
- SSH 私钥、密码、token、cookie、服务器 IP/账号资料
- Obsidian 私有记录和历史工作内容
- 项目构建产物、日志、缓存、媒体输出和运行态文件

## 安全和隐私

AS 默认只使用本地文件存储，不需要托管数据库、仪表盘或 HTTP 端口。

AS 生成的启动上下文只是给 AI 参考的证据，不高于系统、开发者和当前用户指令。

敏感运维资料只有在用户明确需要时才可以保存在本地 AM，不要扩散进共享模板、可复用 Skill、Obsidian 总结或公开文档。

## 验证

把模板复制到新工作区后，或修改 hook、工具、skill、策略后，运行：

```powershell
node --test .codex\hooks\pre_tool_use.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
```

如果你维护的是 AS 模板仓库本身，再检查：

- `docs/PUBLISHING_CHECKLIST.md`
- `SECURITY.md`
- `THIRD_PARTY_NOTICES.md`
- `git status --short --branch`
- 适合当前环境的本地敏感信息扫描

## 限制

- AS 主要面向 Windows 上的本地 Codex 工作区。
- 它不是托管记忆服务。
- 它不能替代人的运维判断，只提供门禁、预演和验证约束。
- 它应该作为干净模板复制使用，不要从已经运行过的私人工作区直接生成共享模板。

## 维护规则

保持模板小而清晰。优先选择本地、no-port、可审计的流程，不要默认加入仪表盘、后台服务或大依赖。不要把生成状态、本地凭据、大缓存、对话日志或私有项目文件放进共享模板。

修改安全策略或 hook 前，先运行验证命令。新增外部来源的 skill 或工作流时，更新 `THIRD_PARTY_NOTICES.md`。

## 许可证

MIT。见 [LICENSE](LICENSE)。
