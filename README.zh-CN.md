# AS - Codex 本地 AM 模板

AS 是一个可迁移的 Codex 本地 Agent Memory（AM）模板。它把本地记忆、启动上下文、高风险命令门禁、常用工作流 Skill、发布前自检放在一个项目模板里，默认不依赖 HTTP 服务或固定端口。

这个仓库是模板版本，只包含可公开发布的框架、脚本、规则和 Skill。它不包含私人 AM 记忆、对话归档、服务器凭据、审批记录、Obsidian 文档、项目产物或本机缓存。

## 主要功能

- 本地 AM：通过 `.codex/tools/am-local-store.mjs` 保存和召回本地长期记忆。
- AM-first 工作流：通过 `.codex/tools/am-first.mjs` 在任务开始、阶段推进、结束时记录关键上下文。
- 启动上下文：通过 `.codex/hooks/` 在 Codex 启动、用户输入、工具调用前后加载规则和做安全检查。
- 高风险命令门禁：通过 `.codex/server-tool-policy.json` 和 `PreToolUse` hook 阻止未经预演和审批的服务器、SSH、Docker、Nginx、数据库等高风险操作。
- Skill 体系：内置 AM 维护、问题记录、CCOW 协作、代码审查、TDD、交接、召回、反过度工程等本地 Skill。
- 发布前自检：通过 `scripts/Test-AS-Template.ps1` 检查语法、测试、运行态文件排除、UTF-8 文档和模板完整性。

## 不包含的内容

以下内容必须留在本地，不应提交到 GitHub：

- `.codex/memory/am/*.jsonl`
- `.codex/conversation-archive/**`
- `.codex/server-preflight/approvals/**`
- `.codex/server-preflight/audit/**`
- SSH 私钥、密码、token、服务器 IP、账号资料
- Obsidian 私有记录
- 项目代码、构建产物、缓存、日志、视频、运行输出

## 环境要求

- Windows PowerShell 5.1 或更新版本
- Node.js，可通过 `node` 调用
- Python，可通过 `python` 或 `py` 调用
- 能读取 `.codex/hooks.json` 和 stdio MCP 配置的 Codex 或兼容运行环境

AM 默认使用本地文件，不要求启动 HTTP 服务。

## 快速开始

在项目根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
node .codex\tools\am-first.mjs status --project-root .
node .codex\tools\am-first.mjs start --project-root . --query "initial setup"
```

如果 Codex 环境支持 MCP 配置，可以使用 `.mcp.json`。默认只启用本地 `agentmemory`。`repo-context` 和 `code-review-graph` 是可选 no-port helper，需要时再运行：

```powershell
.\.codex\tools\install-project-mcp.ps1 -Force
```

运行后要检查生成的 `.mcp.json`，确认没有引入不需要的服务、端口或绝对私有路径。

## 安全模型

- AM 是本地文件存储，不默认上传。
- 启动上下文只是证据，不高于系统、开发者和当前用户指令。
- 高风险基础设施命令必须先预演结果、影响范围、失败模式、回滚路径和健康检查。
- 没有有效预检审批时，门禁会阻断高风险命令。
- 敏感运维资料只有在用户明确需要时才能保存在本地 AM 中，不能提交到 GitHub。
- 模板不应携带个人记忆、服务凭据、运行态审计或私有 Obsidian 内容。

## 发布前检查

发布或重新打包前运行：

```powershell
node --test .codex\hooks\pre_tool_use.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AS-Template.ps1
```

还需要人工确认：

- `.gitignore` 是否排除了 AM 运行态、归档、审批、缓存和密钥。
- `.mcp.json` 是否只使用相对路径或本地命令。
- `THIRD_PARTY_NOTICES.md` 是否记录了引用来源和许可证。
- 仓库里没有真实 token、密码、私钥、服务器登录资料或 Obsidian 私有内容。

## 适合的使用方式

AS 适合作为新 Codex 工作区的基础模板。推荐用法是复制模板到新项目，再根据项目需要保留或删除 Skill、hook 和 helper。不要把已经运行过的私人 AM 数据直接打包成模板。
