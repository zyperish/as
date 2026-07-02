#!/usr/bin/env node
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAPABILITY_REGISTRY_VERSION,
  listExternalCapabilities,
  searchExternalCapabilities,
  validateExternalCapabilityRegistry,
} from './external-capability-registry.mjs';

const DEFAULT_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT_RELATIVE_PATH = path.join('.codex', 'knowledge-assets', 'third-party-skill-assets.json');
const USER_STANDING_RULE = '以后我让你看的项目要考虑到所有我们已经部署的项目，并且要看完全部信息，部署完之后还要复查。';

export async function buildThirdPartySkillAssets(projectRoot = DEFAULT_PROJECT_ROOT, options = {}) {
  const root = path.resolve(projectRoot || DEFAULT_PROJECT_ROOT);
  const registry = listExternalCapabilities({ target: options.target || '' });
  const assets = registry.projects.map((project) => ({
    id: project.id,
    name: project.name,
    sourceUrl: project.sourceUrl,
    summary: summarizeProject(project),
    targetSystems: project.primaryTargets,
    adoption: project.adoption,
    deploymentDecision: project.deploymentDecision,
    allowedUse: project.allowedUse,
    sourceCopyAllowed: project.sourceCopyAllowed,
    safety: project.safety,
    hazards: project.hazards,
    licenseProvenance: project.licenseProvenance,
    projectBuckets: project.projectBuckets,
    deployedProjectTargets: project.deployedProjectTargets,
    runtimeShape: project.runtimeShape,
    licenseRisk: project.licenseRisk,
    usefulFor: project.usefulFor,
    mechanisms: project.mechanisms,
    doNotCopy: project.doNotCopy,
    keywords: project.keywords,
  }));
  const wCapabilityCards = buildWCapabilityCards(assets);
  return {
    schemaVersion: CAPABILITY_REGISTRY_VERSION,
    generatedAt: new Date().toISOString(),
    generator: '.codex/tools/third-party-absorb.mjs',
    policy: registry.defaultPolicy,
    standingRules: [
      {
        id: 'external-project-audit-all-deployed-projects',
        source: 'user',
        language: 'zh-CN',
        text: USER_STANDING_RULE,
        required: true,
        concepts: ['all-deployed-projects', 'full-info-review', 'post-deploy-recheck', 'subagent-assisted-audit'],
      },
    ],
    deploymentTargets: registry.deploymentTargets,
    assets,
    wCapabilityCards,
    targetMap: buildTargetMap(assets),
    projectBucketMap: buildProjectBucketMap(assets, wCapabilityCards),
    validation: validateExternalCapabilityRegistry(),
    notes: [
      'This is a local, no-port knowledge asset registry.',
      'Use mechanisms and locally-authored schemas only; do not copy third-party source into templates.',
      'AM, CCOW, Codex self workflow, and other projects can all consume this file.',
      'Standing rule: every new external project audit must consider all deployed projects, inspect high-signal information, and recheck after deployment.',
    ],
    debug: {
      projectRoot: root,
    },
  };
}

export async function writeThirdPartySkillAssets(projectRoot = DEFAULT_PROJECT_ROOT, options = {}) {
  const root = path.resolve(projectRoot || DEFAULT_PROJECT_ROOT);
  const outputPath = path.resolve(root, options.output || OUTPUT_RELATIVE_PATH);
  ensureInside(root, outputPath);
  const data = await buildThirdPartySkillAssets(root, options);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return {
    ok: true,
    outputPath,
    assetCount: data.assets.length,
    wCapabilityCardCount: data.wCapabilityCards.length,
    targetMap: data.targetMap,
  };
}

function buildWCapabilityCards(assets) {
  const cards = [
    {
      id: 'wt-mesh-graph-export',
      name: 'WT Mesh Graph Export',
      targetSystems: ['ccow', 'am', 'codex_self', 'other_projects'],
      inspiredBy: ['mindgraph', 'project-graph'],
      summary: 'Export Run, Board, WT, LW, W, Gate, Lock, Artifact, and Error nodes as JSON-first graphs for console views, AM goal boards, and other project dashboards.',
      recommendedProfiles: ['BoardPlannerLead', 'RiskJudge', 'IntegrationLead'],
      outputRefs: ['ccow-wt-mesh.mjs exportMindGraphWtMesh()'],
      projectBuckets: ['ccow-swarm-workbench', 'am-local-memory-platform', 'modeling_workflow', 'other-projects-general'],
    },
    {
      id: 'mission-control-governance',
      name: 'Mission Control Governance',
      targetSystems: ['ccow', 'am', 'codex_self'],
      inspiredBy: ['paperclip', 'mission-control'],
      summary: 'Track active/blocked WT, approvals, recovery queue, heartbeat, token/cost signals, and risk summary without adding a service.',
      recommendedProfiles: ['RiskJudge', 'GateReviewLead', 'MemoryCurator'],
      outputRefs: ['taskGraph.missionControl', 'AM project board'],
      projectBuckets: ['ccow-swarm-workbench', 'am-local-memory-platform', 'codex-local-template'],
    },
    {
      id: 'memory-quality-graph',
      name: 'Memory Quality Graph',
      targetSystems: ['am', 'codex_self'],
      inspiredBy: ['mem0', 'letta', 'zep', 'graphrag'],
      summary: 'Use concepts, recency, source strength, fact coverage, and graph-style relationships to rank recall and maintenance suggestions.',
      recommendedProfiles: ['MemoryCurator', 'AssetReferenceLead'],
      outputRefs: ['am-vnext-index.json', 'am-project-board.json'],
      projectBuckets: ['am-local-memory-platform', 'am-conversation-archive'],
    },
    {
      id: 'functional-lw-profiles',
      name: 'Functional LW Profiles',
      targetSystems: ['ccow', 'codex_self', 'am', 'other_projects'],
      inspiredBy: ['claude-agent-examples', 'emperor-agent', 'multica'],
      summary: 'Launch stable functional subagents with baseline skills, Goal Mode, cache-pool packets, file-backed inbox patterns, and xhigh reasoning instead of blank one-off prompts.',
      recommendedProfiles: ['BoardPlannerLead', 'ImplementationLead', 'ModelingLead', 'QALead', 'RiskJudge', 'MemoryCurator'],
      outputRefs: ['ccow-subagent-profiles.mjs', 'ccow-cache-pool.mjs'],
      projectBuckets: ['ccow-swarm-workbench', 'codex-local-template', 'skill-workflow-pack', 'am-local-memory-platform'],
    },
    {
      id: 'game-modeling-board',
      name: 'Game Modeling Board',
      targetSystems: ['ccow', 'am', 'codex_self', 'other_projects'],
      inspiredBy: ['aigameanent', 'swarm-ide', 'ag-ui'],
      summary: 'Plan Reference, Asset Inventory, Model Production, Blender Verify, Godot Integration, Final QA, Recovery, and event logs as parallel WT boards for game/modeling projects.',
      recommendedProfiles: ['AssetReferenceLead', 'ModelingLead', 'GateReviewLead', 'QALead'],
      outputRefs: ['createModelingBoardTasks()', 'AM project board asset workflow notes'],
      projectBuckets: ['modeling_workflow', 'ccow-swarm-workbench', 'other-projects-general'],
    },
    {
      id: 'future-distributed-wt',
      name: 'Future Distributed WT',
      targetSystems: ['ccow', 'codex_self', 'other_projects', 'deployed_projects', 'lab_only'],
      inspiredBy: ['wenzagent'],
      summary: 'Keep LAN/RPC, remote agent proxy, file chunk transfer, and MCP skill transport ideas as future lab-only references; current deployment remains local/no-port by default.',
      recommendedProfiles: ['IntegrationLead', 'RiskJudge'],
      outputRefs: ['external-capability-registry.mjs'],
      projectBuckets: ['ccow-swarm-workbench', 'codex-local-template', 'other-projects-general'],
    },
    {
      id: 'workflow-preset-library',
      name: 'Workflow Preset Library',
      targetSystems: ['ccow', 'codex_self', 'other_projects'],
      inspiredBy: ['multi-agent-playground'],
      summary: 'Keep router_specialists, planner_executor, supervisor_dynamic, peer_handoff, and single_agent_chat as lightweight local presets without importing LangGraph or FastAPI runtime.',
      recommendedProfiles: ['BoardPlannerLead', 'IntegrationLead', 'RiskJudge'],
      outputRefs: ['ccow-wt-mesh.mjs listWorkflowPresets()'],
      projectBuckets: ['ccow-swarm-workbench', 'codex-local-template', 'other-projects-general'],
    },
    {
      id: 'agent-team-governance',
      name: 'Agent Team Governance',
      targetSystems: ['ccow', 'am', 'codex_self', 'other_projects'],
      inspiredBy: ['multica', 'paperclip', 'emperor-agent'],
      summary: 'Treat agents as accountable teammates with statuses, blockers, approvals, budgets, pause/resume, audit timeline, and stable leader-routed teams.',
      recommendedProfiles: ['RiskJudge', 'GateReviewLead', 'IntegrationLead', 'MemoryCurator'],
      outputRefs: ['ccow missionControl', 'AM goal board', 'future project dashboards'],
      projectBuckets: ['ccow-swarm-workbench', 'am-local-memory-platform', 'codex-local-template', 'other-projects-general'],
    },
    {
      id: 'file-backed-agent-inbox',
      name: 'File-Backed Agent Inbox',
      targetSystems: ['ccow', 'am', 'codex_self', 'other_projects'],
      inspiredBy: ['claude-agent-examples', 'emperor-agent'],
      summary: 'Use per-agent JSONL inboxes, plan approval responses, shutdown requests, compressed memory packets, and attachment sidecar references for resumable local coordination.',
      recommendedProfiles: ['BoardPlannerLead', 'IntegrationLead', 'MemoryCurator', 'RiskJudge'],
      outputRefs: ['ccow-cache-pool messages/<wtId>/<lwId>.jsonl', 'AM resume packets'],
      projectBuckets: ['ccow-swarm-workbench', 'am-local-memory-platform', 'codex-local-template'],
    },
    {
      id: 'context-compression-stack',
      name: 'Context Compression Stack',
      targetSystems: ['codex_self', 'ccow', 'am', 'other_projects'],
      inspiredBy: ['headroom', 'whetstone'],
      summary: 'Use reversible compression, retrieve-on-demand references, cache alignment, and preflight/install-boundary checklists as local design patterns without enabling a proxy or global wrapper by default.',
      recommendedProfiles: ['ContextCompressionLead', 'RiskJudge', 'MemoryCurator'],
      outputRefs: ['external-capability-registry.mjs', 'AM health/project board'],
      projectBuckets: ['codex-local-template', 'am-local-memory-platform', 'ccow-swarm-workbench'],
    },
    {
      id: 'cli-output-compression',
      name: 'CLI Output Compression',
      targetSystems: ['codex_self', 'ccow', 'am', 'other_projects'],
      inspiredBy: ['rtk', 'lean-ctx'],
      summary: 'Compress shell, test, git, and log output into compact summaries while preserving exit codes and raw-output references for failure analysis.',
      recommendedProfiles: ['ContextOpsLead', 'DebugLead', 'ImplementationLead'],
      outputRefs: ['future shell-output summarizer policy', 'matt-diagnose verification notes'],
      projectBuckets: ['codex-local-template', 'skill-workflow-pack', 'ccow-swarm-workbench', 'am-local-memory-platform'],
    },
    {
      id: 'video-podcast-pipeline',
      name: 'Video Podcast Pipeline',
      targetSystems: ['other_projects', 'codex_self', 'ccow'],
      inspiredBy: ['video-podcast-maker'],
      summary: 'Model content projects as gated artifact pipelines: topic, research, script, human review, TTS, timing, Remotion preview, FFmpeg/render, and publish verification.',
      recommendedProfiles: ['ContentPipelineLead', 'AssetReferenceLead', 'QALead'],
      outputRefs: ['future content workflow preset', 'other project pipeline docs'],
      projectBuckets: ['content_pipeline_workflow', 'other-projects-general', 'codex-local-template'],
    },
    {
      id: 'context-os-governance',
      name: 'Context OS Governance',
      targetSystems: ['am', 'codex_self', 'ccow', 'other_projects'],
      inspiredBy: ['lean-ctx', 'headroom', 'rtk'],
      summary: 'Route reads through modes, budgets, PathJail-style path boundaries, secret-like deny rules, context proof, and token ledger ideas while keeping existing AM/repo-context/code-review-graph ownership.',
      recommendedProfiles: ['ContextOpsLead', 'RiskJudge', 'MemoryCurator'],
      outputRefs: ['am-vnext.mjs project board', 'ccow missionControl riskSignals'],
      projectBuckets: ['am-local-memory-platform', 'codex-local-template', 'ccow-swarm-workbench', 'code-review-graph'],
    },
  ];
  return cards.map((card) => ({
    ...card,
    assetIds: card.inspiredBy.filter((id) => assets.some((asset) => asset.id === id)),
    riskSummary: summarizeCardRisk(card, assets),
  }));
}

function buildTargetMap(assets) {
  const out = {};
  for (const asset of assets) {
    for (const target of asset.targetSystems || []) {
      if (!out[target]) out[target] = [];
      out[target].push(asset.id);
    }
  }
  for (const key of Object.keys(out)) out[key] = [...new Set(out[key])].sort();
  return out;
}

function buildProjectBucketMap(assets, cards) {
  const out = {};
  for (const item of [...assets, ...cards]) {
    for (const bucket of item.projectBuckets || item.deployedProjectTargets || []) {
      if (!out[bucket]) out[bucket] = { assets: [], cards: [] };
      if (item.assetIds) out[bucket].cards.push(item.id);
      else out[bucket].assets.push(item.id);
    }
  }
  for (const bucket of Object.keys(out)) {
    out[bucket].assets = [...new Set(out[bucket].assets)].sort();
    out[bucket].cards = [...new Set(out[bucket].cards)].sort();
  }
  return out;
}

function summarizeCardRisk(card, assets) {
  const related = assets.filter((asset) => card.inspiredBy.includes(asset.id));
  return {
    sourceCopyAllowed: false,
    requiresApproval: related.some((asset) => asset.safety?.requiresApproval),
    hazardousAssetIds: related.filter((asset) => asset.hazards?.hasHazards).map((asset) => asset.id),
    licenseReviewAssetIds: related.filter((asset) => asset.licenseProvenance?.requiresLicenseReview).map((asset) => asset.id),
    note: 'Capability cards are locally authored mechanism summaries, not install/run approval.',
  };
}

function summarizeProject(project) {
  const useful = project.usefulFor.slice(0, 3).join(', ');
  return `${project.name} is kept as ${project.adoption} for ${useful}. Runtime: ${project.runtimeShape}. Risk: ${project.licenseRisk}.`;
}

function ensureInside(parent, target) {
  const root = path.resolve(parent);
  const resolved = path.resolve(target);
  const relative = path.relative(root, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolved;
  }
  throw new Error(`Refusing to write outside project root: ${target}`);
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'write';
  const start = command === 'write' && argv[0]?.startsWith('--') ? 0 : 1;
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
    '  node third-party-absorb.mjs write [--project-root <dir>] [--output <path>]',
    '  node third-party-absorb.mjs print [--project-root <dir>]',
    '  node third-party-absorb.mjs search --query <text> [--target <target>]',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    return;
  }
  const projectRoot = path.resolve(args['project-root'] || DEFAULT_PROJECT_ROOT);
  let result;
  if (args._ === 'write') {
    result = await writeThirdPartySkillAssets(projectRoot, { output: args.output, target: args.target });
  } else if (args._ === 'print') {
    result = await buildThirdPartySkillAssets(projectRoot, { target: args.target });
  } else if (args._ === 'search') {
    result = searchExternalCapabilities(args.query || args.q || '', { target: args.target, limit: args.limit });
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
