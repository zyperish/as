# AMP

AMP（Agent Memory Plus）是一个给 Codex 工作区使用的本地 Agent Memory 模板。它在不启动托管服务、数据库、仪表盘或 HTTP 端口的情况下，为新工作区提供长期记忆、安全门禁、工作流 Skill 和可复用交接习惯。

当你希望后续 AI 会话能记住项目事实、加载本地规则、主动选择正确 Skill，并在执行高风险运维命令前停下来预演时，可以使用 AMP。它适合作为干净模板复制到一个 Codex 工作区根目录。

[English README](README.md)

## AMP 是什么

AMP 不是 AI 模型，不是托管记忆产品，也不是 SaaS 后端。它是一个本地工作区模板，主要由这些部分组成：

- Codex hook 配置；
- 本地文件型记忆存储；
- 记忆和验证命令行工具；
- 高风险命令门禁；
- 可复用本地 Skill；
- 维护模板安全边界的文档。

更准确地说，AMP 是“AI 工作区记忆增强和工作流脚手架”：它给 AI 一个本地运行秩序，让 AI 在项目里能记住、检查、预演、交接。

## 为什么要用

AI 写代码或运维时，常见失败模式很固定：

- 下一次会话忘记上次已经学到的东西；
- 旧记忆压过当前项目事实；
- SSH、Docker、Nginx、数据库、Git 破坏性命令没有预演就执行；
- AI 忘记调用本该使用的工作流 Skill；
- 交接记录太粗，下一轮无法安全继续；
- 中文 Markdown 或记忆 payload 被 shell 编码写坏。

AMP 把这些问题对应的本地规则和工具打包在一起。复制到新工作区后，AI 从第一天就有记忆、检查、门禁和工作流约束。

## 你会得到什么

- **本地 AM**：运行时把长期项目事实、用户偏好、经验教训和会话总结保存在 `.codex/memory/`。
- **AM-first 命令**：`am-first.mjs` 统一提供 `status`、`start`、`stage`、`finish`、`reflect`、`viewer`。
- **启动上下文 hook**：在会话开始和用户输入时加载紧凑本地规则和记忆。
- **高风险命令门禁**：SSH、Docker、Nginx、数据库、防火墙、破坏性 Git、递归删除等命令会在执行前被检查。
- **精确命令预演审批**：高风险服务器命令需要写清目标、预期效果、影响范围、失败模式、回滚方式、健康检查，并生成一次性审批文件。
- **Skill Gate**：非小任务会按任务类型选择对应 Skill，不只依赖聊天上下文。
- **Obsidian 问题记录流程**：内置 Skill 可维护 AI 问题清单、解决记录索引和一个问题一个 md 的记录体系。
- **默认不占端口**：正常记忆、检查和 viewer 导出都走本地文件或 stdio，不需要端口。

## 安装到工作区

把模板文件复制到你想升级的 Codex 工作区根目录。复制后，根目录大致应该是这样：

```text
<你的工作区>/
  .codex/
  scripts/
  docs/
  README.md
  README.zh-CN.md
  SECURITY.md
  THIRD_PARTY_NOTICES.md
```

然后运行模板检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AMP-Template.ps1
```

这个检查会验证 Node 语法、hook 测试、AM 状态、运行态目录是否干净、`.gitignore` 是否覆盖运行态目录，以及文档是否 UTF-8 干净。

## 第一组命令

查看本地 AM 是否可用：

```powershell
node .codex\tools\am-first.mjs status --project-root .
```

带着具体任务启动一次工作会话：

```powershell
node .codex\tools\am-first.mjs start --project-root . --query "修复结账页 bug"
```

完成一个阶段后写 checkpoint：

```powershell
node .codex\tools\am-first.mjs stage --project-root . --summary "已定位失败路由并验证 API 返回，下一步修 validation。"
```

任务结束时写结果和验证：

```powershell
node .codex\tools\am-first.mjs finish --project-root . --summary "已修复 validation，测试通过，未执行部署。"
```

保存一条以后还能复用的经验：

```powershell
node .codex\tools\am-first.mjs reflect --project-root . --summary "修改结账 validation 前，先同时验证前端 schema 和后端 API 约束。"
```

刷新本地静态记忆查看页：

```powershell
node .codex\tools\am-first.mjs viewer --project-root .
```

## 一次正常任务怎么跑

AMP 引导下的一次任务通常是这样：

1. **Start**：先用 `am-first start` 带当前任务查询本地记忆。
2. **选 Skill**：`skill-trigger-gate` 判断这类任务应该使用哪个本地 Skill。
3. **读证据**：AI 读取相关文件和规则，而不是凭聊天印象猜。
4. **阶段记录**：每完成一个有意义阶段，写一条 `am-first stage`。
5. **高风险预演**：遇到服务器或破坏性命令，先写预期结果、风险、回滚和健康检查。
6. **验证**：运行项目检查或最小相关测试。
7. **Finish**：最后用 `am-first finish` 写清改了什么、怎么验证。

## 高风险命令流程

AMP 不能替代人的运维判断。它做的是让 AI 在危险命令前停下来，把影响和回滚讲清楚。

当命令匹配 `.codex/server-tool-policy.json` 中的风险规则时，pre-tool hook 会检查有没有“精确命令、未过期、未使用”的审批文件。没有审批就阻断。

创建审批：

```powershell
.\scripts\Invoke-ServerPreflight.ps1 `
  -Command '<准备执行的完整命令>' `
  -Target '<主机、容器、服务、数据库或本地路径>' `
  -ExpectedEffect '<预期会改变什么>' `
  -BlastRadius '<可能影响什么范围>' `
  -FailureModes '<可能怎样失败>' `
  -Rollback '<失败后怎么回滚或恢复>' `
  -HealthChecks '<执行后怎么验证成功>' `
  -ApprovedByUser
```

审批只对完全相同的命令生效，而且只能使用一次。创建审批不会执行命令。

有些命令即使审批也会被绝对阻断，例如删除根目录、破坏 SSH 配置、清空防火墙、删除数据库、格式化磁盘、未审批递归强删、破坏性 Git reset、关闭本机安全边界。

## MCP 和可选 helper

如果你的 Codex 环境支持 MCP 配置，可以使用 `.mcp.json` 作为本地 stdio MCP 配置。

`repo-context` 和 `code-review-graph` 是可选 helper，需要时再生成：

```powershell
.\.codex\tools\install-project-mcp.ps1 -Force
```

生成后先检查 `.mcp.json`。不要默认加入后台服务、仪表盘或长期占用端口，除非当前工作区明确需要。

## 主要组件

```text
.codex/hooks.json
  连接 session start、prompt context、pre-tool、stop、archive 等 hook。

.codex/hooks/
  hook 脚本和测试。高风险命令门禁在这里。

.codex/tools/am-local-store.mjs
  本地记忆实现。

.codex/tools/am-first.mjs
  AM 主入口：status、start、stage、finish、reflect、viewer。

.codex/server-tool-policy.json
  风险命令模式、允许的信息查询命令、绝对阻断命令模式。

.codex/skills/
  本地工作流 Skill，包括调试、审查、AM 维护、交接、README 写作、CCOW 协作、Obsidian 记录等。

scripts/Test-AMP-Template.ps1
  复制模板后的 readiness 检查。

scripts/Invoke-ServerPreflight.ps1
  为高风险命令创建精确审批。

docs/PUBLISHING_CHECKLIST.md
  AMP 模板仓库维护者检查清单。
```

## 仓库结构

```text
.codex/
  hooks/                  Codex hook 脚本和测试
  skills/                 本地工作流 Skill
  tools/                  AM、MCP、安全和辅助工具
  server-tool-policy.json 高风险命令策略
scripts/                  readiness、AM、viewer、preflight 脚本
docs/                     AMP 模板仓库维护者检查清单
README.md                 英文项目说明
README.zh-CN.md           中文说明
SECURITY.md               私有数据边界说明
THIRD_PARTY_NOTICES.md    来源和许可证说明
```

## 安全和隐私

AMP 默认只使用本地文件存储，不需要托管数据库、仪表盘或 HTTP 端口。

AMP 生成的启动上下文只是给 AI 参考的证据，不高于系统、开发者和当前用户指令。

敏感运维资料只有在用户明确需要时才可以保存在本地 AM，不要扩散进共享模板、可复用 Skill、Obsidian 总结或公开文档。

仓库安全边界见 `SECURITY.md`。

## 常见问题

**`Test-AMP-Template.ps1` 的 Node 语法检查失败**

确认当前 shell 里能直接运行 `node`。

**服务器命令被阻断**

先读阻断信息，用 `Invoke-ServerPreflight.ps1` 写精确预演审批，再只执行被审批的那条完整命令。

**记忆召回像是旧的**

用更窄的 `am-first start` 查询，优先相信当前项目证据，不要让旧归档摘要压过当前事实。

**中文显示乱码**

按 UTF-8 读取文件，不要用 PowerShell 默认重定向写中文 Markdown。运行 `Test-AMP-Template.ps1`，里面包含 UTF-8 和 mojibake 检查。

**MCP helper 起不来**

检查 `.mcp.json` 是否使用本地相对命令，并确认可选 helper 是你主动生成的。

## 验证

把模板复制到新工作区后，或修改 hook、工具、skill、策略后，运行：

```powershell
node --test .codex\hooks\pre_tool_use.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-AMP-Template.ps1
```

如果你维护的是 AMP 模板仓库本身，再检查：

- `docs/PUBLISHING_CHECKLIST.md`
- `SECURITY.md`
- `THIRD_PARTY_NOTICES.md`
- `git status --short --branch`
- 适合当前环境的本地敏感信息扫描

## 限制

- AMP 主要面向 Windows 上的本地 Codex 工作区。
- 它不是托管记忆服务。
- 它不能替代人的生产运维判断。
- 它不会自动保证旧记忆正确；当前证据仍然优先。
- 它应该作为干净模板复制使用，不要从已经运行过的私人工作区直接生成共享模板。

## 维护规则

保持模板小而可审计。优先选择本地、no-port 的工作流，不要默认加入仪表盘、后台服务或大依赖。

修改安全策略或 hook 前，先运行验证命令。新增外部来源的 Skill 或工作流时，更新 `THIRD_PARTY_NOTICES.md`。

## 许可证

MIT。见 [LICENSE](LICENSE)。
