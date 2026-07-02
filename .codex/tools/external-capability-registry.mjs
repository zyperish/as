#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAPABILITY_REGISTRY_VERSION = 1;

export const DEPLOYMENT_TARGETS = Object.freeze([
  'ccow',
  'am',
  'codex_self',
  'other_projects',
  'deployed_projects',
  'knowledge_assets',
  'lab_only',
]);

const VALID_DEPLOYMENT_DECISIONS = Object.freeze([
  'knowledge-only',
  'schema-reference',
  'lab-candidate',
  'tools-source',
  'project-skill',
  'root-template',
  'reject',
]);

const PROJECTS = Object.freeze([
  {
    id: 'swarm-ide',
    name: 'swarm-ide',
    sourceUrl: 'https://github.com/chmod777john/swarm-ide',
    primaryTargets: ['ccow', 'codex_self'],
    adoption: 'knowledge_assets',
    runtimeShape: 'multi-agent IDE service reference',
    licenseRisk: 'no root license confirmed locally; do not copy source',
    usefulFor: ['observable swarm UI', 'agent tree', 'topology', 'human intervention', 'LLM/tool history'],
    mechanisms: ['Swarm-IDE style panes', 'agent graph', 'direct agent messaging', 'conversation tree'],
    doNotCopy: ['service wiring', 'unlicensed source', 'Docker/runtime setup'],
    keywords: ['swarm-ide', 'swarm ui', 'agent tree', 'topology', 'human intervention', 'llm history', 'tool calls'],
  },
  {
    id: 'openagent',
    name: 'openAgent',
    sourceUrl: 'https://github.com/lkpAgent/openAgent',
    primaryTargets: ['am', 'ccow', 'other_projects'],
    adoption: 'knowledge_assets',
    runtimeShape: 'agent knowledge/workflow platform reference',
    licenseRisk: 'treat as reference until license and deployment footprint are rechecked',
    usefulFor: ['knowledge layer', 'question answering over runs', 'workflow concepts'],
    mechanisms: ['local knowledge search', 'workflow board', 'data/question layer'],
    doNotCopy: ['database/service stack', 'accounts/cloud assumptions'],
    keywords: ['openagent', 'knowledge layer', 'workflow', 'rag', 'question answering', 'ask data'],
  },
  {
    id: 'ag-ui',
    name: 'AG-UI',
    sourceUrl: 'https://github.com/ag-ui-protocol/ag-ui',
    primaryTargets: ['ccow', 'other_projects'],
    adoption: 'schema_reference',
    runtimeShape: 'event protocol reference',
    licenseRisk: 'protocol ideas only unless exact package/license is approved',
    usefulFor: ['realtime event stream', 'agent UI protocol', 'run timeline'],
    mechanisms: ['typed agent events', 'streamed messages', 'tool-call events', 'state snapshots'],
    doNotCopy: ['SDK runtime without approval'],
    keywords: ['ag-ui', 'events', 'sse', 'stream', 'agent protocol', 'tool call event'],
  },
  {
    id: 'open-multi-agent',
    name: 'open-multi-agent',
    sourceUrl: 'https://github.com/open-multi-agent/open-multi-agent',
    primaryTargets: ['ccow', 'codex_self'],
    adoption: 'knowledge_assets',
    runtimeShape: 'multi-agent planning reference',
    licenseRisk: 'reference only until fresh license review',
    usefulFor: ['automatic DAG', 'planner/executor separation', 'parallel task decomposition'],
    mechanisms: ['DAG planner', 'dependency graph', 'parallel execution policy'],
    doNotCopy: ['framework runtime', 'remote service assumptions'],
    keywords: ['open-multi-agent', 'dag', 'task graph', 'planner executor', 'multi-agent'],
  },
  {
    id: 'mission-control',
    name: 'Mission Control',
    sourceUrl: 'https://github.com/builderz-labs/mission-control',
    primaryTargets: ['ccow', 'am', 'codex_self'],
    adoption: 'governance_reference',
    runtimeShape: 'agent operations dashboard reference',
    licenseRisk: 'reference only unless separately approved',
    usefulFor: ['cost dashboard', 'approval gates', 'audit timeline', 'risk panel'],
    mechanisms: ['budget/cost signal', 'safety audit', 'approval gate', 'heartbeat monitor'],
    doNotCopy: ['service deployment', 'auth/account stack'],
    keywords: ['mission control', 'cost', 'budget', 'audit', 'approval', 'risk', 'heartbeat'],
  },
  {
    id: 'mem0',
    name: 'Mem0',
    sourceUrl: 'https://github.com/mem0ai/mem0',
    primaryTargets: ['am', 'codex_self'],
    adoption: 'memory_mechanism_reference',
    runtimeShape: 'memory framework reference',
    licenseRisk: 'do not replace AM storage; reuse concepts only',
    usefulFor: ['memory extraction', 'importance', 'decay', 'user/project memory'],
    mechanisms: ['memory quality signals', 'semantic recall', 'memory update policy'],
    doNotCopy: ['hosted/vector stack', 'provider-specific storage'],
    keywords: ['mem0', 'memory', 'importance', 'decay', 'semantic recall', 'user memory'],
  },
  {
    id: 'letta',
    name: 'Letta',
    sourceUrl: 'https://github.com/letta-ai/letta',
    primaryTargets: ['am', 'codex_self'],
    adoption: 'memory_agent_reference',
    runtimeShape: 'stateful agent platform reference',
    licenseRisk: 'do not deploy server/database stack without approval',
    usefulFor: ['agent state', 'archival memory', 'working memory', 'tool memory policy'],
    mechanisms: ['memory tiers', 'stateful agent loop', 'explicit memory operations'],
    doNotCopy: ['server/database runtime', 'accounts/cloud features'],
    keywords: ['letta', 'stateful agent', 'working memory', 'archival memory', 'memory tiers'],
  },
  {
    id: 'zep',
    name: 'Zep',
    sourceUrl: 'https://github.com/getzep/zep',
    primaryTargets: ['am'],
    adoption: 'memory_governance_reference',
    runtimeShape: 'memory service/reference',
    licenseRisk: 'do not introduce service/database dependency',
    usefulFor: ['session memory', 'fact extraction', 'temporal recall'],
    mechanisms: ['session graph', 'fact history', 'recency-aware recall'],
    doNotCopy: ['server deployment', 'database stack'],
    keywords: ['zep', 'session memory', 'fact extraction', 'temporal recall', 'memory graph'],
  },
  {
    id: 'graphrag',
    name: 'GraphRAG',
    sourceUrl: 'https://github.com/microsoft/graphrag',
    primaryTargets: ['am', 'other_projects'],
    adoption: 'graph_retrieval_reference',
    runtimeShape: 'knowledge graph/RAG pipeline reference',
    licenseRisk: 'too heavy for current AM; keep as future graph layer reference',
    usefulFor: ['concept graph', 'entity relationship recall', 'cluster summaries'],
    mechanisms: ['entity graph', 'community summaries', 'source-grounded retrieval'],
    doNotCopy: ['pipeline/runtime/database stack'],
    keywords: ['graphrag', 'graph rag', 'entity graph', 'community summary', 'knowledge graph'],
  },
  {
    id: 'multi-agent-playground',
    name: 'Multi-Agent-Playground',
    sourceUrl: 'https://github.com/Jasper-zh/Multi-Agent-Playground',
    primaryTargets: ['ccow', 'codex_self', 'other_projects'],
    adoption: 'workflow_preset_reference',
    runtimeShape: 'FastAPI backend on 8011, Vue/Vite frontend, LangGraph workflow examples, optional Electron packaging',
    licenseRisk: 'no root LICENSE found via raw audit; keep as workflow idea reference and do not copy source',
    usefulFor: ['workflow preset library', 'router specialists', 'planner executor', 'supervisor dynamic', 'peer handoff'],
    mechanisms: ['single_agent_chat', 'router_specialists', 'planner_executor', 'supervisor_dynamic', 'peer_handoff', 'LangGraph workflow catalog'],
    doNotCopy: ['FastAPI/Vue service runtime', 'LangGraph framework glue', 'Electron packaging', 'unlicensed source', 'API keys'],
    keywords: ['multi-agent-playground', 'fastapi', 'vue', 'langgraph', 'port 8011', 'router specialists', 'planner executor', 'supervisor dynamic', 'peer handoff', 'workflow preset'],
  },
  {
    id: 'aigameanent',
    name: 'AiGameAnent',
    sourceUrl: 'https://github.com/sconi789/AiGameAnent',
    primaryTargets: ['other_projects', 'ccow', 'am', 'codex_self'],
    adoption: 'game_workflow_reference',
    runtimeShape: 'Node workspace with studio server, Vite studio web on 5173, OpenAI-compatible agent workflow for HTML5 and mini-game production',
    licenseRisk: 'MIT; safe to reference mechanisms, but avoid whole-stack import into templates',
    usefulFor: ['game/modeling board', 'asset inventory', 'platform specialists', 'acceptance event log', 'multi-platform game production'],
    mechanisms: ['studio departments/roles', 'OpenSpec-style flow', 'asset workflow', 'event log', 'OpenAI-compatible local endpoint routing', 'HTML5/WeChat/Douyin mini-game workflow'],
    doNotCopy: ['web studio/server stack', 'Vite runtime on 5173', 'sharp/browser/game dependencies in base template', 'API endpoint secrets'],
    keywords: ['aigameanent', 'aiGameGongfang', 'game agent', 'asset workflow', 'openspec', 'studio', 'godot', 'blender', 'phaser', 'mini-game', 'wechat minigame', 'douyin minigame', 'event log'],
  },
  {
    id: 'multica',
    name: 'multica',
    sourceUrl: 'https://github.com/multica-ai/multica',
    primaryTargets: ['ccow', 'codex_self', 'am', 'other_projects'],
    adoption: 'squad_model_reference',
    runtimeShape: 'Node/Go/Next desktop/web agent platform with Postgres 17 + pgvector and Docker/self-hosting stack',
    licenseRisk: 'modified Apache-style license with extra conditions; do not copy/bundle source without legal review',
    usefulFor: ['WT squad model', 'LW team lead', 'parallel squads', 'autopilots', 'blocker reporting', 'agent teammate UX'],
    mechanisms: ['squads', 'leader-routed teams', 'agents as teammates', 'autopilots', 'issue/activity timeline', 'blocker reporting', 'worktree-aware development flow'],
    doNotCopy: ['Docker stack', 'PostgreSQL/pgvector database', 'desktop/web runtime', 'modified-license source', 'GHCR images', 'secretsmanager/S3 integrations'],
    keywords: ['multica', 'squad', 'team lead', 'wt', 'lw', 'parallel squads', 'autopilot', 'agents as teammates', 'postgres', 'pgvector', 'docker', 'activity timeline', 'blocker'],
  },
  {
    id: 'paperclip',
    name: 'paperclip',
    sourceUrl: 'https://github.com/paperclipai/paperclip',
    primaryTargets: ['ccow', 'am', 'codex_self', 'other_projects'],
    adoption: 'mission_control_reference',
    runtimeShape: 'Node.js server and React UI control plane; quickstart starts API on localhost:3100 with embedded PostgreSQL',
    licenseRisk: 'MIT; direct deployment still needs explicit approval because it starts services, stores data, and can bind LAN',
    usefulFor: ['goal board', 'approval gate', 'budget/cost', 'agent heartbeat', 'risk summary', 'org chart governance', 'portable company templates'],
    mechanisms: ['issue/goals board', 'approvals', 'cost dashboard', 'audit timeline', 'budget hard-stops', 'heartbeats', 'pause/resume/terminate', 'secret-scrubbed import/export'],
    doNotCopy: ['service/account/runtime stack', 'embedded PostgreSQL data', 'Docker image', 'LAN binding', 'telemetry defaults without consent', 'agent/company templates wholesale'],
    keywords: ['paperclip', 'goal board', 'approval', 'cost dashboard', 'agent heartbeat', 'audit timeline', 'budget hard-stop', 'embedded postgres', 'localhost 3100', 'lan bind', 'governance', 'org chart'],
  },
  {
    id: 'claude-agent-examples',
    name: 'claude-agent-examples',
    sourceUrl: 'https://github.com/TheSyart/claude-agent-examples',
    primaryTargets: ['codex_self', 'ccow', 'am', 'other_projects'],
    adoption: 'subagent_pattern_reference',
    runtimeShape: 'Python teaching repo and runnable agent with three-layer memory, compaction, skills, task planning, subagent dispatch, and file-backed message bus',
    licenseRisk: 'no root LICENSE found via raw audit; use concepts only and do not copy code/persona text',
    usefulFor: ['stable teammates', 'subagent registry', 'role prompts', 'file-backed inbox', 'memory compaction', 'plan approval flow'],
    mechanisms: ['fixed subagent profiles', 'Agent Team fixed roster', 'MessageBus JSONL inbox', 'three-layer memory', 'MEMORY.md compaction', 'skills injection', 'plan_approval_response'],
    doNotCopy: ['unlicensed source', 'persona/source text wholesale', 'Anthropic-specific runtime', 'memory runtime files', 'requirements/venv into templates'],
    keywords: ['claude-agent-examples', 'subagent', 'profile', 'stable teammate', 'handoff', 'messagebus', 'jsonl inbox', 'three-layer memory', 'memory.md', 'plan approval', 'skills injection'],
  },
  {
    id: 'emperor-agent',
    name: 'emperor-agent',
    sourceUrl: 'https://github.com/TheSyart/emperor-agent',
    primaryTargets: ['codex_self', 'ccow', 'am', 'other_projects'],
    adoption: 'subagent_governance_reference',
    runtimeShape: 'local Python agent with Vue/Vite WebUI on 8765, multi-provider routing, MCP client, memory, attachments, Ask/Plan control, and optional desktop pet',
    licenseRisk: 'pyproject declares MIT but root LICENSE was not found; assets/notices and service footprint need review before deployment',
    usefulFor: ['coordinator/subagent control', 'memory compression', 'skills injection', 'Ask/Plan approval flow', 'attachment handling', 'model routing'],
    mechanisms: ['team control', 'skill injection', 'startup compression', 'OpenAI tool-call history pairing', 'Ask/Plan pause-resume guard', 'model config probes', 'MCP tool discovery', 'attachment sidecars'],
    doNotCopy: ['WebUI service on 8765', 'model_config secrets', 'memory/attachments runtime files', 'desktop-pet assets', 'MCP external-tool wiring', 'provider config templates wholesale'],
    keywords: ['emperor-agent', 'coordinator', 'subagent governance', 'skill injection', 'compressed report', 'webui 8765', 'ask plan', 'mcp client', 'attachments', 'model routing', 'startup compression'],
  },
  {
    id: 'wenzagent',
    name: 'wenzagent',
    sourceUrl: 'https://github.com/lyming99/wenzagent',
    primaryTargets: ['other_projects', 'ccow', 'codex_self'],
    adoption: 'future_distributed_reference',
    runtimeShape: 'pure Dart LAN/RPC/agent management framework with MCP skill integration and server example on 9090',
    licenseRisk: 'Apache-2.0; safe as future transport reference, but LAN/RPC deployment needs explicit approval',
    usefulFor: ['future distributed WT', 'remote agent', 'cross-device state tracking', 'LAN chunk transfer', 'MCP skill transport'],
    mechanisms: ['LAN discovery', 'RPC request/notification patterns', 'remote agent proxy', 'large-file chunk transfer', 'MCP skill integration', 'OpenAI/Anthropic/Google/Ollama adapters'],
    doNotCopy: ['LAN server on 9090', 'remote execution stack', 'device discovery/transport runtime', 'Dart dependency stack in templates'],
    keywords: ['wenzagent', 'distributed agent', 'remote agent', 'lan', 'rpc', 'cross device', 'dart', 'port 9090', 'mcp skill', 'chunk transfer', 'device discovery'],
  },
  {
    id: 'mindgraph',
    name: 'MindGraph',
    sourceUrl: 'https://github.com/fengyinyue/MindGraph',
    primaryTargets: ['ccow', 'am', 'codex_self', 'other_projects'],
    adoption: 'graph_schema_reference',
    runtimeShape: 'pure frontend React/Vite planning graph reference',
    licenseRisk: 'AGPL-3.0; do not copy source/UI code into CCOW or templates',
    usefulFor: ['JSON-first graph export', 'fileScope allow/deny', 'subgraphs', 'node statuses'],
    mechanisms: ['node graph schema', 'subgraph nodes', 'fileScope', 'AI-friendly JSON', 'left-to-right graph layout'],
    doNotCopy: ['AGPL source', 'UI implementation', 'port 1421 app runtime'],
    keywords: ['mindgraph', 'graph json', 'fileScope', 'subgraph', 'node status', 'planning graph'],
  },
  {
    id: 'project-graph',
    name: 'project-graph',
    sourceUrl: 'https://github.com/graphif/project-graph',
    primaryTargets: ['ccow', 'am', 'other_projects'],
    adoption: 'graph_ux_reference',
    runtimeShape: 'large Tauri/React desktop graph app reference',
    licenseRisk: 'GPL/mixed/unclear at root; do not copy or bundle source',
    usefulFor: ['desktop-grade graph UX', 'undo/redo', 'autosave', 'backup', 'graph artifact files'],
    mechanisms: ['graph file artifacts', 'autosave/backup', 'undo/redo', 'large graph navigation'],
    doNotCopy: ['Tauri/Rust/pnpm/Nx app', 'GPL source', 'fs/shell/updater capabilities', 'port 1420 runtime'],
    keywords: ['project-graph', 'tauri graph', 'undo', 'redo', 'autosave', 'backup', 'prg', 'diagram ux'],
  },
  {
    id: 'video-podcast-maker',
    name: 'video-podcast-maker',
    sourceUrl: 'https://github.com/Agents365-ai/video-podcast-maker',
    primaryTargets: ['other_projects', 'codex_self', 'ccow'],
    adoption: 'content_pipeline_skill_reference',
    runtimeShape: 'README/README_CN guided Remotion, TTS, and FFmpeg production workflow for coding agents',
    licenseRisk: 'MIT; safe to reference, but do not install media dependencies into base template',
    usefulFor: ['video podcast workflow', 'mandatory human review gates', 'Remotion production pipeline', 'multi-platform publishing'],
    mechanisms: ['topic research to script to TTS to Remotion', 'human script quality gate before TTS', 'Remotion Studio preview/edit gate', 'output verification before publishing', 'per-video durable folder layout', 'phoneme/pronunciation preflight'],
    doNotCopy: ['generated videos/assets', 'API keys', 'Remotion project dependencies into base template', 'auto-pull update behavior without consent'],
    keywords: ['video-podcast-maker', 'video podcast', 'remotion', 'tts', 'ffmpeg', 'bilibili', 'youtube', 'xiaohongshu', 'douyin', 'wechat channels', 'podcast.txt', 'timing.json', 'studio review', 'human review gate'],
  },
  {
    id: 'headroom',
    name: 'Headroom',
    sourceUrl: 'https://github.com/chopratejas/headroom',
    primaryTargets: ['codex_self', 'ccow', 'am', 'other_projects'],
    adoption: 'context_compression_reference',
    runtimeShape: 'Python/Rust package with library, optional local HTTP proxy on 8787, MCP server, and agent wrappers',
    licenseRisk: 'Apache-2.0; proxy/MCP/dependency install needs explicit approval and port review',
    usefulFor: ['reversible context compression', 'tool/log/RAG output compression', 'cross-agent memory patterns', 'failure learning'],
    mechanisms: ['ContentRouter', 'SmartCrusher', 'CodeCompressor', 'Compress-Cache-Retrieve store', 'headroom_retrieve MCP tool', 'headroom_stats audit signal', 'agent wrap command'],
    doNotCopy: ['port 8787 proxy into default template', 'ML/model dependencies by default', 'global agent wrappers without approval', 'cached originals containing secrets'],
    keywords: ['headroom', 'headroom-ai', 'context compression', 'proxy 8787', 'mcp compress', 'headroom_compress', 'headroom_retrieve', 'CCR', 'SmartCrusher', 'CodeCompressor', 'cross-agent memory'],
  },
  {
    id: 'rtk',
    name: 'RTK',
    sourceUrl: 'https://github.com/rtk-ai/rtk',
    primaryTargets: ['codex_self', 'ccow', 'am', 'other_projects'],
    adoption: 'cli_output_compression_reference',
    runtimeShape: 'single Rust CLI proxy and hook system for compact command output',
    licenseRisk: 'Apache-2.0; global hooks and telemetry consent must be reviewed before install',
    usefulFor: ['compact shell/test/git output', 'failure-only full-output tee refs', 'token savings analytics', 'hook rewrite policy'],
    mechanisms: ['command-specific filters', 'grouping/truncation/deduplication', 'exit-code preserving proxy', 'tee raw output on failures', 'gain/discover/session analytics', 'hook auto-rewrite boundaries'],
    doNotCopy: ['global hooks into Codex/Claude without approval', 'telemetry opt-in by accident', 'misleading compression for commands needing raw output'],
    keywords: ['rtk', 'rust token killer', 'cli output compression', 'git status', 'test output', 'rtk gain', 'rtk discover', 'tee full output', 'command rewrite', 'token savings', 'develop branch', 'telemetry disabled default'],
  },
  {
    id: 'lean-ctx',
    name: 'LeanCTX',
    sourceUrl: 'https://github.com/yvgude/lean-ctx',
    primaryTargets: ['am', 'codex_self', 'ccow', 'other_projects'],
    adoption: 'context_os_reference',
    runtimeShape: 'local Rust binary with MCP tools, shell hooks, context dashboard, memory, graph, and governance',
    licenseRisk: 'Apache-2.0 plus MIT notice; broad MCP/hooks/dashboard overlap with existing AM/repo-context/code-review-graph, so do not install without separate approval',
    usefulFor: ['context budget governance', 'read-mode routing', 'session memory', 'property graph search', 'context proof and verification'],
    mechanisms: ['10 read modes', 'cached rereads', 'PathJail and role boundary', 'secret-like deny-by-default', 'context packs', 'multi-agent handoff', 'token ledger', 'context proof'],
    doNotCopy: ['global MCP/hook setup', 'dashboard service into default template', 'cloud/team sync without approval', 'replacement of AM/repo-context/code-review-graph'],
    keywords: ['lean-ctx', 'leanctx', 'context os', 'context layer', 'read modes', 'pathjail', 'context proof', 'ctx_handoff', 'ctx_agent', 'session memory', 'property graph', 'context budget', 'secret-like deny-by-default'],
  },
  {
    id: 'whetstone',
    name: 'Whetstone',
    sourceUrl: 'https://github.com/z19r/whetstone',
    primaryTargets: ['codex_self', 'ccow', 'other_projects'],
    adoption: 'stack_installer_reference',
    runtimeShape: 'Rust CLI installer/orchestrator for Headroom, RTK, and project memory providers',
    licenseRisk: 'Cargo metadata says MIT; install modifies global Claude settings, shell profile, PATH, hooks, and per-project .claude files',
    usefulFor: ['idempotent stack setup', 'global vs per-project boundary', 'uninstall/dry-run checklist', 'context optimization stack design'],
    mechanisms: ['single setup command', 'preflight checks', 'timestamped settings backup', 'absolute hook paths', 'memory provider choice', 'compound token savings design', 'STACK-SETUP.md handoff'],
    doNotCopy: ['curl installer execution', 'global ~/.claude/settings.json writes', 'ANTHROPIC_BASE_URL shell profile mutation', 'MemStack/AutoMem databases without approval'],
    keywords: ['whetstone', 'headroom', 'rtk', 'icm', 'automem', 'stack setup', 'preflight', 'uninstall', 'claude settings', 'ANTHROPIC_BASE_URL', 'memory provider'],
  },
]);

export function listExternalCapabilities(options = {}) {
  const target = normalizeTarget(options.target || options.deployTarget || '');
  const projects = PROJECTS
    .map((project) => normalizeProject(project))
    .filter((project) => !target || project.primaryTargets.includes(target) || project.adoption === target);
  return {
    ok: true,
    schemaVersion: CAPABILITY_REGISTRY_VERSION,
    generatedAt: new Date().toISOString(),
    defaultPolicy: {
      noWholeRepoImport: true,
      noServicesByDefault: true,
      noDockerOrDatabaseByDefault: true,
      requiredReasoningEffort: 'xhigh',
      licenseSafeMode: 'copy ideas and locally authored schemas only',
    },
    deploymentTargets: [...DEPLOYMENT_TARGETS],
    projects,
    summary: summarize(projects),
  };
}

export function getExternalCapability(idOrName) {
  const needle = normalizeKey(idOrName);
  if (!needle) throw new Error('project id is required');
  const project = PROJECTS.find((item) => {
    const keys = [item.id, item.name, ...(item.aliases || [])].map(normalizeKey);
    return keys.includes(needle);
  });
  if (!project) throw new Error(`Unknown external capability project: ${idOrName}`);
  return normalizeProject(project);
}

export function searchExternalCapabilities(query = '', options = {}) {
  const target = normalizeTarget(options.target || '');
  const tokens = tokenize(query);
  const rows = listExternalCapabilities({ target }).projects
    .map((project) => ({ project, score: scoreProject(project, tokens) }))
    .filter((item) => item.score > 0 || !tokens.length)
    .sort((a, b) => b.score - a.score || a.project.id.localeCompare(b.project.id))
    .slice(0, clampInt(options.limit, 1, 100, 20));
  return {
    ok: true,
    query: String(query || ''),
    target,
    results: rows.map(({ project, score }) => ({ score, ...project })),
  };
}

export function buildCapabilityTargetMap() {
  const map = {};
  for (const target of DEPLOYMENT_TARGETS) {
    map[target] = PROJECTS
      .map((project) => normalizeProject(project))
      .filter((project) => project.primaryTargets.includes(target) || project.adoption === target || project.deploymentDecision === target)
      .map((project) => project.id);
  }
  return map;
}

export function externalCapabilityKeywords() {
  return PROJECTS.flatMap((project) => [project.id, project.name, ...(project.keywords || []), ...(project.mechanisms || [])]);
}

export function validateExternalCapabilityRegistry() {
  const registry = listExternalCapabilities();
  const violations = [];
  const targetMap = buildCapabilityTargetMap();
  for (const project of registry.projects) {
    if (!VALID_DEPLOYMENT_DECISIONS.includes(project.deploymentDecision)) {
      violations.push(`${project.id}: invalid deploymentDecision ${project.deploymentDecision}`);
    }
    if (!Array.isArray(project.allowedUse) || !project.allowedUse.length) {
      violations.push(`${project.id}: allowedUse is required`);
    }
    if (project.sourceCopyAllowed !== false) {
      violations.push(`${project.id}: third-party source copying must be disabled by default`);
    }
    if (!project.safety || typeof project.safety.requiresApproval !== 'boolean') {
      violations.push(`${project.id}: safety.requiresApproval is required`);
    }
    if (!project.hazards || !Array.isArray(project.hazards.ports)) {
      violations.push(`${project.id}: machine-readable hazards are required`);
    }
    if (!project.licenseProvenance?.licenseStatus || !project.licenseProvenance?.checkedAt) {
      violations.push(`${project.id}: licenseProvenance is required`);
    }
    if (project.hazards?.hasHazards && !project.safety.requiresApproval) {
      violations.push(`${project.id}: hazardous runtime requires approval`);
    }
    if (project.hazards?.hasHazards && !project.primaryTargets.includes('lab_only')) {
      violations.push(`${project.id}: hazardous runtime must also be visible under lab_only`);
    }
    if (project.primaryTargets.includes('other_projects') && !project.primaryTargets.includes('deployed_projects')) {
      violations.push(`${project.id}: other_projects must also route to deployed_projects`);
    }
    if (!Array.isArray(project.deployedProjectTargets) || !project.deployedProjectTargets.length) {
      violations.push(`${project.id}: deployedProjectTargets are required for AM routing`);
    }
  }
  for (const target of ['ccow', 'am', 'codex_self', 'other_projects', 'deployed_projects', 'lab_only']) {
    if (!targetMap[target]?.length) violations.push(`target ${target} has no mapped projects`);
  }
  return {
    ok: violations.length === 0,
    checkedAt: new Date().toISOString(),
    projectCount: registry.projects.length,
    violations,
    targetMap,
  };
}

function normalizeProject(project) {
  const hazards = inferHazards(project);
  const deploymentDecision = project.deploymentDecision || inferDeploymentDecision(project, hazards);
  const primaryTargets = inferPrimaryTargets(project, hazards);
  const licenseProvenance = inferLicenseProvenance(project);
  return {
    schemaVersion: CAPABILITY_REGISTRY_VERSION,
    id: project.id,
    name: project.name,
    sourceUrl: project.sourceUrl,
    primaryTargets,
    adoption: project.adoption || 'knowledge_assets',
    deploymentDecision,
    allowedUse: inferAllowedUse(project, deploymentDecision),
    sourceCopyAllowed: false,
    safety: {
      requiresApproval: hazards.hasHazards || licenseProvenance.requiresLicenseReview,
      approvalRequiredFor: inferApprovalRequiredFor(hazards, licenseProvenance),
      defaultUseIsKnowledgeOnly: true,
      noRuntimeByDefault: true,
    },
    hazards,
    licenseProvenance,
    projectBuckets: inferProjectBuckets(project, primaryTargets),
    deployedProjectTargets: inferDeployedProjectTargets(project, primaryTargets),
    runtimeShape: project.runtimeShape || '',
    licenseRisk: project.licenseRisk || '',
    usefulFor: unique(project.usefulFor || []),
    mechanisms: unique(project.mechanisms || []),
    doNotCopy: unique(project.doNotCopy || []),
    keywords: unique(project.keywords || []),
  };
}

function summarize(projects) {
  const byTarget = {};
  const byAdoption = {};
  for (const project of projects) {
    for (const target of project.primaryTargets) byTarget[target] = (byTarget[target] || 0) + 1;
    byAdoption[project.adoption] = (byAdoption[project.adoption] || 0) + 1;
  }
  return {
    projectCount: projects.length,
    byTarget,
    byAdoption,
    byDeploymentDecision: projects.reduce((out, project) => {
      out[project.deploymentDecision] = (out[project.deploymentDecision] || 0) + 1;
      return out;
    }, {}),
    noPortDefault: true,
    sourceCopyAllowed: false,
  };
}

function scoreProject(project, tokens) {
  if (!tokens.length) return 1;
  const text = [
    project.id,
    project.name,
    project.sourceUrl,
    project.adoption,
    project.deploymentDecision,
    project.runtimeShape,
    project.licenseRisk,
    ...(project.primaryTargets || []),
    ...(project.allowedUse || []),
    ...(project.projectBuckets || []),
    ...(project.deployedProjectTargets || []),
    ...(project.usefulFor || []),
    ...(project.mechanisms || []),
    ...(project.keywords || []),
  ].join('\n').toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (project.id.toLowerCase() === token || project.name.toLowerCase() === token) score += 8;
    else if (text.includes(token)) score += 2;
  }
  return score;
}

function normalizeTarget(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[-\s]+/gu, '_');
  if (text === 'deployed_project' || text === 'deployed_projects') return 'deployed_projects';
  return DEPLOYMENT_TARGETS.includes(text) ? text : '';
}

function inferPrimaryTargets(project, hazards) {
  const targets = [...(project.primaryTargets || [])];
  if (targets.includes('other_projects')) targets.push('deployed_projects');
  if (hazards.hasHazards) targets.push('lab_only');
  return unique(targets);
}

function inferDeploymentDecision(project, hazards) {
  const adoption = String(project.adoption || '').toLowerCase();
  if (adoption.includes('schema')) return 'schema-reference';
  if (hazards.hasHazards) return 'lab-candidate';
  if (adoption.includes('skill')) return 'project-skill';
  if (adoption.includes('tools-source')) return 'tools-source';
  if (adoption.includes('root-template')) return 'root-template';
  if (adoption.includes('reject')) return 'reject';
  return 'knowledge-only';
}

function inferAllowedUse(project, deploymentDecision) {
  const allowed = ['locally-authored summary', 'mechanism reference', 'future planning input'];
  if (deploymentDecision === 'schema-reference') allowed.push('locally-authored schema');
  if (deploymentDecision === 'project-skill') allowed.push('project-scoped workflow template after approval');
  if (String(project.adoption || '').includes('graph')) allowed.push('graph/relationship ideas');
  if (String(project.adoption || '').includes('memory')) allowed.push('memory policy ideas');
  return unique(allowed);
}

function inferHazards(project) {
  const text = [
    project.runtimeShape,
    project.licenseRisk,
    ...(project.doNotCopy || []),
    ...(project.keywords || []),
  ].join('\n');
  const ports = unique([...text.matchAll(/\b(?:localhost:)?([1-9][0-9]{3,4})\b/gu)]
    .map((match) => Number(match[1]))
    .filter((port) => port >= 1024 && port <= 65535));
  const lower = text.toLowerCase();
  const hazards = {
    ports,
    services: /\b(service|server|webui|http|proxy|vite|fastapi|tauri|electron|lan|rpc|mcp server|dashboard)\b/iu.test(text),
    docker: /\bdocker|ghcr\b/iu.test(text),
    database: /\bpostgres|postgresql|pgvector|database|db\b/iu.test(text),
    globalConfig: /\bglobal|shell profile|path|settings\.json|hook|wrapper|anthropic_base_url|\.claude\b/iu.test(text),
    apiKeys: /\bapi key|api keys|secrets?|provider config|model_config\b/iu.test(text),
    telemetry: /\btelemetry\b/iu.test(text),
  };
  hazards.hasHazards = Boolean(
    hazards.ports.length ||
    hazards.services ||
    hazards.docker ||
    hazards.database ||
    hazards.globalConfig ||
    hazards.apiKeys ||
    hazards.telemetry ||
    lower.includes('license') && /no root|modified|agpl|gpl|unclear/iu.test(text)
  );
  return hazards;
}

function inferApprovalRequiredFor(hazards, licenseProvenance) {
  const required = ['source-copy'];
  if (hazards.services || hazards.ports.length) required.push('run-service');
  if (hazards.docker) required.push('docker');
  if (hazards.database) required.push('database');
  if (hazards.globalConfig) required.push('global-config');
  if (hazards.apiKeys) required.push('api-keys');
  if (hazards.telemetry) required.push('telemetry');
  if (licenseProvenance.requiresLicenseReview) required.push('license-review');
  return unique(required);
}

function inferLicenseProvenance(project) {
  const text = String(project.licenseRisk || '');
  const lower = text.toLowerCase();
  let spdx = 'NOASSERTION';
  let status = 'unknown';
  if (/agpl-?3\.0/iu.test(text)) {
    spdx = 'AGPL-3.0';
    status = 'copyleft_known';
  } else if (/\bgpl\b/iu.test(text)) {
    spdx = 'GPL';
    status = 'copyleft_or_mixed';
  } else if (/apache-?2\.0/iu.test(text)) {
    spdx = 'Apache-2.0';
    status = 'permissive_known';
  } else if (/\bmit\b/iu.test(text)) {
    spdx = 'MIT';
    status = lower.includes('root license was not found') || lower.includes('cargo metadata') ? 'declared_not_root_verified' : 'permissive_known';
  }
  if (/no root license|unclear|treat as reference|fresh license review|exact package\/license|unknown/iu.test(text)) {
    status = status === 'permissive_known' ? 'declared_not_root_verified' : 'unknown_or_unverified';
  }
  if (/modified/iu.test(text)) status = 'modified_requires_review';
  const requiresLicenseReview = !['permissive_known'].includes(status);
  return {
    licenseStatus: status,
    spdx,
    checkedAt: '2026-06-04',
    sourceRef: project.sourceUrl,
    evidence: text || 'No license evidence recorded in registry.',
    sourceRedistributionAllowed: false,
    locallyAuthoredSummaryAllowed: true,
    requiresLicenseReview,
  };
}

function inferProjectBuckets(project, primaryTargets) {
  const text = [
    project.id,
    project.name,
    project.adoption,
    project.runtimeShape,
    ...(project.usefulFor || []),
    ...(project.mechanisms || []),
    ...(project.keywords || []),
  ].join('\n').toLowerCase();
  const buckets = ['external-capability-registry'];
  if (/agent|multi-agent|subagent|workflow|squad|wt|lw|swarm|mission|approval|governance/iu.test(text)) {
    buckets.push('agent-orchestration-knowledge-assets');
  }
  if (primaryTargets.includes('ccow')) buckets.push('ccow-swarm-workbench');
  if (primaryTargets.includes('am') || /memory|recall|context|graph|rag/iu.test(text)) buckets.push('am-local-memory-platform');
  if (primaryTargets.includes('codex_self')) buckets.push('codex-local-template', 'skill-workflow-pack');
  if (primaryTargets.includes('other_projects') || primaryTargets.includes('deployed_projects')) buckets.push('other-projects-general');
  if (/game|modeling|godot|blender|asset|villa|3d|graph export|diagram/iu.test(text)) {
    buckets.push('modeling_workflow');
  }
  if (/video|podcast|remotion|tts|ffmpeg|content|publish/iu.test(text)) buckets.push('content_pipeline_workflow');
  if (/review|code graph|impact|dependency/iu.test(text)) buckets.push('code-review-graph');
  return unique(buckets);
}

function inferDeployedProjectTargets(project, primaryTargets) {
  return inferProjectBuckets(project, primaryTargets)
    .filter((bucket) => !bucket.endsWith('_workflow') && bucket !== 'other-projects-general');
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_:/.-]+/gu, ' ')
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 40);
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_]+/gu, '-');
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function unique(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'list';
  const start = command === 'list' && argv[0]?.startsWith('--') ? 0 : 1;
  const out = { _: command };
  for (let index = start; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function usage() {
  return [
    'Usage:',
    '  node external-capability-registry.mjs list [--target ccow|am|codex_self|other_projects|deployed_projects|knowledge_assets|lab_only]',
    '  node external-capability-registry.mjs show --project <id>',
    '  node external-capability-registry.mjs search --query <text> [--target <target>] [--limit <n>]',
    '  node external-capability-registry.mjs target-map',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;
  if (args.help || args.h) {
    console.log(usage());
    return;
  }
  if (args._ === 'list') {
    result = listExternalCapabilities({ target: args.target });
  } else if (args._ === 'show') {
    result = { ok: true, project: getExternalCapability(args.project || args.id) };
  } else if (args._ === 'search') {
    result = searchExternalCapabilities(args.query || args.q || '', { target: args.target, limit: args.limit });
  } else if (args._ === 'target-map') {
    result = { ok: true, targetMap: buildCapabilityTargetMap() };
  } else {
    throw new Error(`Unknown command: ${args._}\n${usage()}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
