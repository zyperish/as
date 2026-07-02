# AM 联动规则

AM 是长期记忆；Obsidian 是完整记录。不要用 AM 替代 Obsidian。

## 写入 AM 的条件

写入：

- 用户明确说记住、以后都这样、下一个 AI 也要知道。
- 形成稳定工作流、用户偏好、项目结构事实。
- 发现可复用防错规则。
- AM 进步点总结中提炼出明确改进规则。
- 用户明确要求长期记住敏感登录资料，或任务执行确实依赖这些资料持续可用（例如服务器 SSH、账号、密码、密钥、端口、令牌）；此时允许写入 AM，但不要写入 Obsidian。

不写入：

- 一次性命令输出。
- 大段日志。
- 完整解决记录。
- 缓存、构建产物、临时文件。
- 子智能体原始输出、临时提示词、一次性检索上下文、当前轮用完即丢的 AM 工作记录。
- 默认不要把敏感信息写进 Obsidian、索引、模板化总结或可复用规则；如确实要长期保存，优先局部写入 AM，并保持结构化、易检索、避免无关扩散。

## 用完即清理

- AM 是长期记忆，不是临时剪贴板；能不写临时记录就不要写。
- 如果为了当前任务创建了临时 AM 记录，必须保存返回的 memory id，并在使用完成后执行 tombstone/forget。
- 本地清理优先使用：

```powershell
node .codex/tools/am-local-store.mjs forget --project-root "<项目根目录>" --id "<memory-id>" --reason "temporary_record_consumed"
```

- 清理后用 recall 精确查询验证该 id 或标题不再进入结果。
- 不要直接物理删除 `.jsonl`；除非用户明确确认要破坏性删除具体记录。
- 不要把用户偏好、项目事实、部署决策、可复用经验、交接摘要、用户明确要求保存的敏感登录资料当作临时记录删除。

## 命令

优先使用项目内本地 no-port 工具：

```powershell
node .codex/tools/am-local-store.mjs recall --project-root "<项目根目录>" --query "<查询词>" --limit 5
node .codex/tools/am-local-store.mjs remember --project-root "<项目根目录>" --payload-file "<payload.json>"
```

中文内容推荐使用 `--payload-file`，避免 shell 管道编码损坏。

## 验证

写入后尽量 recall。若 recall 超时，用精确搜索或本地存储证据验证，并在记录里说明。

AM 不可用时，不阻塞 Obsidian；在记录中写明“AM 未可用，本次未写入长期记忆”。
