# Agent Note：固定工作区的故事书创造任务

状态：已实现

[English](2026-08-31-storybook-creation-mode.md) | 中文

## 问题

Storyweaver 已有完整的人工故事书工作台，但没有对话式创作 Agent。恢复标准 coding preset 虽然能让模型创建 JSON，却也会在角色扮演产品中暴露 Shell、任意文件系统路径、仓库和无关 Agent 工具，而普通 Director 与 Actor 会话有意排除了这些能力。只让聊天生成 JSON，则会把校验和持久化工作留给玩家，也无法形成可以离开后继续使用的持久工作区。

## 决策

当前支持的独立创作与重写接线由[创作恢复决策](2026-09-08-independent-authoring-recovery.zh.md)说明。本文保留其余流程和所有权理由。

创造模式是与故事列表并列的固定工作区，而不是既有 Story 的附属入口。工作区中的每个 Session 对应一次独立的新故事书创建任务。新建任务时，玩家先通过宿主目录选择器明确授权一个本地工作目录；系统再创建隔离草稿 Story，并以 `storyweaver-creator` preset 和所选 `cwd` 创建专属 `control` Session。取消目录选择不会留下空任务。任务保存时同步 JSON 中的标题、简介和模板标识，`storybook_publish` 将草稿发布为故事列表中的故事书基础设定并结束该任务。

创造 preset 挂载 `@deepseek-ai/dsh-experimental-tool-director/creator`。该插件移除继承工具并注册严格故事书工具与 `story_file_*` 受管草稿工具；preset 随后只加入本地 `read`、`read_image`、`write`、`edit`、`glob` 和 `grep`。这些本地工具由现有文件系统与 sandbox 策略约束在 Session 的授权 `cwd`，不挂载 Shell、网络、删除、委派或运行时导演能力。没有 `cwd` 的旧创造任务会被工具守卫拒绝本地文件调用，不能退回宿主进程目录。

故事书工具把正式读取与写入委托给 Story Controller。`storybook_save` 必须携带 `storybook_read` 返回的准确内容修订，校验完整的严格 schemaVersion 4 文档，并使用控制器内串行化的原子替换。通用 `write`、`edit` 会拒绝 `world/storybook.json`，因此不存在绕过校验的替代写入路径。

`story_file_read`、`story_file_write` 和 `story_file_edit` 继续只接受所属 Story 的 `world/`、`assets/` 区域下规范化逻辑 UTF-8 路径，并拒绝路径穿越、绝对路径、反斜杠、符号链接、不支持的扩展名和超过 2 MiB 的文件。它们与授权本地工作区是两个清楚分开的命名空间；受管 `world/storybook.json` 仍只能通过 `storybook_read` / `storybook_save` 修改，不能被本地通用写入绕过校验。

侧边栏固定显示创造工作区、任务新建按钮和持久任务列表。每个任务都有需要确认的删除操作，会从产品中移除其隔离草稿聚合与受管运行态。创造会话拥有独立标识、工作区状态条和可展开工具轨迹；普通 Director 与 Actor 工具调用继续隐藏。进行中的草稿不会重复出现在故事列表，发布后才作为故事书出现。

## 考虑过的替代方案

**复用标准 coding preset。** 这种方案可以最大化复用 Agent 能力，但其 Shell、仓库、任意文件系统、委派和工作流权限会破坏 Storyweaver 不暴露路径的 Story 边界，并且显著超出故事书创作所需权限。

**让创造 Agent 使用通用文件工具写入受管故事书。** 直接文件写入会绕过乐观并发、严格 schema 校验、默认值规范化、Story feed 更新和现有浏览器编辑器保存约定。专用保存工具让正式变更继续只有一个边界。

**只在 assistant 正文中生成 JSON。** 这种方案不需要文件权限，但玩家必须手工复制、校验和保存每次结果；迭代创作也会退化成无状态文档交换，而不是可恢复的 Agent 工作区。

**把创造模式附着到当前 Story。** 这会把“创建新故事书”和“修改当前故事”混在一起，也会与当前 Story 已有控制会话发生冲突。固定工作区把每次创建任务隔离为独立 Session 和独立草稿。

## 后果

玩家可以让创造 Agent 直接读取现有小说、人物资料和设定文件，并把生成结果写回明确授权的本地目录，同时保留严格校验与发布的受管故事书路径。界面显示实际授权目录；历史重写在运行中或队列非空时不可触发，并明确说明已经执行的工具操作和文件改动不会随模型历史回滚。创造模式仍不能删除或移动文件、运行脚本、访问网络、扩大到授权目录之外或调用运行时角色扮演能力。
