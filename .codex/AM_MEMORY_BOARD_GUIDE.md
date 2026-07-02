# AM 记忆板块分类指南

本指南说明本地 AM 记忆板块的推荐分类。发布模板不包含私有
`.codex\memory\am\am-project-board.json`；首次运行后如生成 board/index，
再按本文件理解字段和板块。分类是 non-destructive：不改写历史记忆，
只建立阅读和整理入口。

## 统计来源

- 模板默认不带记忆统计。
- 实际统计来自本地运行后生成的 `.codex\memory\am\am-project-board.json`。
- 不要把个人记忆数量、项目名或历史统计写入公开模板。

## 板块

| id | 名称 | 定位 |
| --- | --- | --- |
| `am-local-memory-platform` | AM Local Memory Platform | AM 本地记忆平台、goal、维护、静态 console。 |
| `am-conversation-archive` | AM Archive / Cross-Project Memory | 完整对话归档、跨项目记忆、archive-backed summaries。 |
| `ccow-swarm-workbench` | CCOW Swarm Workbench | CCOW、多智能体、缓存池、协调/恢复工作流。 |
| `agent-orchestration-knowledge-assets` | Agent Orchestration Knowledge Assets | 第三方 agent/orchestration 知识资产。 |
| `external-capability-registry` | External Capability Registry | 外部能力注册、能力卡、无端口知识路由。 |
| `palace-villa-blank-3d-world` | Palace Villa / blank-3d-world | 已归档 Godot/Blender 项目证据和经验。 |
| `repo-context-mcp` | Repo Context MCP | 本地 repo 上下文 MCP。 |
| `code-review-graph` | Code Review Graph | 代码图谱、影响分析、架构审查。 |
| `skill-workflow-pack` | Codex Skill Workflow Pack | 本地 skills 工作流包。 |
| `paperclip-workflow` | Paperclip Workflow | Paperclip 风格 issue/goal/approval/cost 规划。 |
| `codex-local-template` | Codex Local Template / MCP Base | Codex 本地模板、hooks、MCP、端口守卫。 |

## 单条记忆字段标准

| 字段 | 说明 |
| --- | --- |
| `title` | 简短标题。 |
| `layer` | `episodic`、`semantic`、`procedural`、`diagnostic`。 |
| `type` | 记忆类型，如 `project_state`、`lesson`、`user_preference`。 |
| `importance` | 重要度。 |
| `confidence` | 可信度。 |
| `project/deploymentProjectId` | 所属项目或板块。 |
| `concepts` | 检索概念。 |
| `source.path` | 证据路径。 |
| `summary` | 摘要，不放长正文。 |
| `evidenceRefs` | 证据引用。 |
| `updatedAt` | 更新时间。 |
| `reusable` | 是否可复用。 |

## 层级标准

- `episodic`：一次会话、一次阶段、一次运行发生了什么。
- `semantic`：稳定事实、项目状态、用户偏好。
- `procedural`：可复用流程、规则、经验。
- `diagnostic`：故障、编码、端口、hook、恢复状态。

## 整理规则

- 只用 index/board/recall 读摘要，不直接打开巨大 `memories.jsonl`。
- `unassigned` 只做二次分类建议，不破坏历史。
- 坏记录用 tombstone/forget 流程，不直接删文件。

