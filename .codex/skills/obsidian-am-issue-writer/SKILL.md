---
name: obsidian-am-issue-writer
description: Use whenever the user reports an AI problem, asks to solve/record an AI issue, asks for Obsidian AI records, issue lists, solution records, absorption/project summaries, AM improvement summaries, or durable workflow memory. This skill enforces updating the Obsidian AI tracking system, one-md-per-record writing, clickable indexes, verification-before-checkoff, and AM linkage so the agent does not forget to document work.
---

# Obsidian AM Issue Writer

用这个 Skill 维护用户的 Obsidian AI 工作记录，并把必要的可复用规则沉淀到本地 AM。它是强约束工作流，不是可选笔记。

## 强制触发

只要出现以下任意情况，必须使用本 Skill：

- 用户反馈 AI 有问题、让你解决问题、记录问题、整理清单、更新索引或打勾。
- 用户要求查看、吸纳、总结第三方项目、仓库、文档、方法论、Skill 或 prompt。
- 用户要求总结 AM 记忆、重要记忆、需要进步的点、AI 后续改进。
- 本次工作改变了用户对 AI 记录、Obsidian、AM、Skill 或长期规则的要求。

如果一开始忘记使用，本轮发现后必须补做 Obsidian 记录，并在记录里写明遗漏原因和补救动作。

## 必读参考

按任务读取相关文件：

- Obsidian 目录、索引、清单规则：`references/obsidian-structure.md`
- 问题解决记录、吸纳总结、AM 进步点写法：`references/writing-logic.md`
- AM 联动与安全边界：`references/am-integration.md`
- AM 进步点总结细则：`references/am-improvement-summary.md`

## 五个记录板块

默认在用户指定 Obsidian Vault 下维护 `AI问题跟踪/`。不要写死具体电脑路径；如果用户已给路径，按用户路径执行。

```text
AI问题跟踪/
  AI问题清单.md
  AI问题解决记录列表.md
  AI问题解决记录/
  吸纳项目总结/
  AM进步点总结/
  _archive/
```

1. `AI问题清单.md`：用户可随手分行写问题；AI 整理成待办，解决并验证后打勾。
2. `AI问题解决记录列表.md`：只给用户看索引，顶部有 `问题解决总数：N`，下面是可点击链接。
3. `AI问题解决记录/`：一个问题一个 `.md`，详细写怎么解决。
4. `吸纳项目总结/`：一个项目一个 `.md`，详细写吸收了什么、未吸收什么、为什么。
5. `AM进步点总结/`：一个复盘主题一个 `.md`，写证据、影响、改进动作、验证方式和是否写回 AM。

## 执行铁律

1. 未验证完成前，不得把 `AI问题清单.md` 的问题改成 `[x]`。
2. 已解决问题必须有独立解决记录 md。
3. `AI问题解决记录列表.md` 只做索引，不放模板、说明文、表格、归档说明。
4. 索引用 `[[路径|显示文字]]`，顶部 `问题解决总数：N` 必须等于正式记录链接数。
5. 吸纳项目总结必须列出“已吸收内容”“未吸收内容”“明确不吸收内容”。
6. AM 进步点总结必须列出证据、影响、具体改进动作、下次验证方式、是否写回 AM。
7. 不永久删除记录；撤回、废弃、误写文件先放 `_archive/`，并说明原路径和原因。
8. 不把日志、缓存、完整长文、临时 payload、子智能体原始输出写进 Skill 或 AM。
9. AM 不可用时继续维护 Obsidian，并在记录里说明 AM 未写入或未验证。

## AM 联动

- AM 是长期记忆；Obsidian 是完整记录。不要用 AM 替代 Obsidian。
- 写入 AM 的内容必须短、可执行、可复用：用户偏好、项目事实、稳定工作流、防错规则、AM 进步点短规则。
- 本地 AM 可以保存用户明确批准或任务必需的敏感运维资料，但不要扩散到 Obsidian、Skill、模板、cache packet 或宽泛总结。
- 不写入一次性命令输出、大段日志、完整解决记录、缓存、构建产物、临时检索上下文、子智能体原始输出。
- 如果为了当前任务创建临时 AM 记录，必须保存 memory id，使用后执行 tombstone/forget，并验证 recall 不再返回。
- 不直接物理删除 `.jsonl`；除非用户明确确认要破坏性删除具体记录。

## 防乱码规则

- 中文 Markdown、Obsidian 记录、`SKILL.md`、规则文件必须保存为 UTF-8。
- 手工编辑优先使用 `apply_patch`。
- 禁止用未显式编码的 PowerShell `Set-Content`、`Out-File`、`Add-Content`、`>`、`>>` 写中文文档。
- 读取和验证中文文档也必须显式 UTF-8；PowerShell 使用 `Get-Content -Encoding UTF8`。
- 默认 PowerShell 显示乱码不等于文件已损坏，必须用 UTF-8 或字节级检查确认。
- 禁止用 PowerShell here-string、管道或重定向直接传递中文 JSON/Markdown 给 Node、AM 或其他命令。
- 中文 payload 使用 `apply_patch`、`--payload-file` 或明确 UTF-8 API。
- 完成前扫描新改文档：连续三个问号、替换字符 `U+FFFD`、常见 mojibake 片段。规则说明里的 `mojibake` 术语本身不算失败。

## 标准流程

1. 定位 Obsidian Vault 和 `AI问题跟踪/`。
2. 判断本次属于问题记录、吸纳总结、AM 进步点，或多类同时发生。
3. 需要处理 AI 问题时，先在 `AI问题清单.md` 建立或整理未完成项。
4. 完成实际处理。
5. 创建或更新对应独立 md。
6. 更新 `AI问题解决记录列表.md`，重新计算总数。
7. 做文件存在、链接数量、UTF-8 读回、乱码哨兵、内容完整性验证。
8. 验证通过后再给清单打勾。
9. 如果产生长期规则或用户偏好，写入 AM 短记忆并尽量验证 recall。

## 完成前检查

最终回复前逐项确认：

- 是否应该写 Obsidian；如果应该，是否已经写。
- 是否有独立 md；如果没有，原因是否明确。
- 清单是否只在验证后打勾。
- 索引总数是否正确。
- 吸纳总结是否列出未吸收内容。
- AM 进步点总结是否有证据和行动项。
- 是否需要写 AM；如果需要，是否写入或说明不可用。
- 新改中文文档是否 UTF-8 干净。
