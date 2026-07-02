#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_REASONING_EFFORT = 'xhigh';

const DEFAULT_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_SKILLS = Object.freeze([
  'file-reading-optimizer',
  'matt-diagnose',
  'matt-tdd',
  'karpathy-guidelines',
  'superpowers-lite',
  'context-and-adr-planning',
]);

const PROFILE_DEFS = Object.freeze([
  {
    profileId: 'RiskJudge',
    functionalName: 'RiskJudge',
    boardType: 'judge',
    responsibilities: ['find hidden risk', 'reject implicit serialisation', 'check approval gates', 'check safety boundaries'],
    defaultLanes: ['risk_review', 'dependency_review', 'approval_gate_review'],
    requiredSkills: ['third-party-project-audit', 'code-review-graph', 'matt-zoom-out'],
    writeScope: ['cache-pool packets only', 'review packet only'],
    forbidden: ['mark goal complete', 'approve deployment alone', 'copy third-party source', 'start services'],
  },
  {
    profileId: 'ContextOpsLead',
    functionalName: 'ContextOpsLead',
    boardType: 'context',
    responsibilities: ['map capabilities across CCOW, AM, Codex self, and deployed projects', 'keep terminology consistent', 'route project buckets'],
    defaultLanes: ['context_map', 'project_bucket_review', 'routing_review'],
    requiredSkills: ['kb-retriever-lite', 'context-and-adr-planning'],
    writeScope: ['cache-pool packets only', 'context packet only'],
    forbidden: ['rewrite AM history', 'install external tools', 'narrow findings to CCOW only'],
  },
  {
    profileId: 'MemoryCurator',
    functionalName: 'MemoryCurator',
    boardType: 'memory',
    responsibilities: ['verify AM preservation', 'check recall/discoverability', 'write durable lessons when requested'],
    defaultLanes: ['memory_check', 'recall_check', 'quality_review'],
    requiredSkills: ['recall', 'remember', 'session-history', 'am-reflection-maintenance'],
    writeScope: ['cache-pool packets', 'AM memory only when explicitly requested or at final checkpoint'],
    forbidden: ['delete memory directly', 'run AM HTTP services', 'spread user-approved secrets outside local AM', 'rewrite history destructively'],
  },
  {
    profileId: 'ImplementationLead',
    functionalName: 'ImplementationLead',
    boardType: 'coding',
    responsibilities: ['own bounded implementation slice', 'preserve existing patterns', 'report changed files'],
    defaultLanes: ['interface', 'implementation', 'local_validation'],
    requiredSkills: ['matt-tdd', 'matt-diagnose', 'karpathy-guidelines'],
    writeScope: ['assigned files only', 'cache-pool packets'],
    forbidden: ['revert unrelated user changes', 'edit unassigned slices in parallel work', 'claim unrun tests passed'],
  },
  {
    profileId: 'IntegrationLead',
    functionalName: 'IntegrationLead',
    boardType: 'integration',
    responsibilities: ['merge WT packets', 'check conflicts', 'consume completed WT without waiting for all when possible'],
    defaultLanes: ['packet_merge', 'conflict_check', 'integration_gate'],
    requiredSkills: ['matt-diagnose', 'context-and-adr-planning'],
    writeScope: ['integration files assigned by Coordinator', 'cache-pool packets'],
    forbidden: ['block unrelated WT', 'expand all raw logs by default', 'bypass gates'],
  },
  {
    profileId: 'QALead',
    functionalName: 'QALead',
    boardType: 'qa',
    responsibilities: ['independent validation', 'browser/UI verification when needed', 'regression reporting'],
    defaultLanes: ['test_plan', 'verification', 'regression_review'],
    requiredSkills: ['matt-diagnose', 'browser:control-in-app-browser'],
    writeScope: ['verification evidence', 'cache-pool packets'],
    forbidden: ['participate in build decisions for the same WT', 'claim visual checks without evidence'],
  },
  {
    profileId: 'ModelingLead',
    functionalName: 'ModelingLead',
    boardType: 'modeling',
    responsibilities: ['coordinate model/asset production lanes', 'respect Blender/Godot/image gates', 'track artifact evidence'],
    defaultLanes: ['scope', 'reference', 'build', 'verify', 'recovery'],
    requiredSkills: ['matt-diagnose', 'karpathy-guidelines'],
    writeScope: ['assigned asset/model files', 'cache-pool packets'],
    forbidden: ['bypass image2 gate', 'skip Blender/Godot validation', 'overwrite unrelated assets'],
  },
  {
    profileId: 'AssetReferenceLead',
    functionalName: 'AssetReferenceLead',
    boardType: 'reference',
    responsibilities: ['collect source/style evidence', 'produce compact reference packets', 'avoid unrelated long logs'],
    defaultLanes: ['source_scan', 'style_pack', 'evidence_packet'],
    requiredSkills: ['kb-retriever-lite', 'file-reading-optimizer'],
    writeScope: ['reference packets', 'cache-pool packets'],
    forbidden: ['invent unsupported references', 'copy copyrighted source text beyond summary needs'],
  },
  {
    profileId: 'GateReviewLead',
    functionalName: 'GateReviewLead',
    boardType: 'gate_review',
    responsibilities: ['check human/resource/integration gates', 'ensure failures enter recovery', 'prevent premature completion'],
    defaultLanes: ['gate_check', 'recovery_check', 'completion_audit'],
    requiredSkills: ['matt-zoom-out', 'code-review-graph'],
    writeScope: ['gate packets', 'cache-pool packets'],
    forbidden: ['mark overall goal complete', 'clear blockers without evidence'],
  },
  {
    profileId: 'DebugLead',
    functionalName: 'DebugLead',
    boardType: 'debug',
    responsibilities: ['reproduce failure', 'own patch hypothesis', 'verify regression'],
    defaultLanes: ['repro', 'patch', 'verify'],
    requiredSkills: ['matt-diagnose', 'matt-tdd'],
    writeScope: ['assigned debug slice', 'cache-pool packets'],
    forbidden: ['skip reproduction when feasible', 'hide flaky failures'],
  },
  {
    profileId: 'ContentPipelineLead',
    functionalName: 'ContentPipelineLead',
    boardType: 'content_pipeline',
    responsibilities: ['model gated media/content workflows', 'track human review gates', 'verify output artifacts'],
    defaultLanes: ['research', 'script', 'human_gate', 'render_verify'],
    requiredSkills: ['kb-retriever-lite', 'matt-diagnose'],
    writeScope: ['content pipeline packets', 'cache-pool packets'],
    forbidden: ['publish without approval', 'store API keys or generated media blobs in cache pool'],
  },
  {
    profileId: 'ContextCompressionLead',
    functionalName: 'ContextCompressionLead',
    boardType: 'context_compression',
    responsibilities: ['summarize large outputs', 'preserve raw refs for failures', 'avoid misleading compression'],
    defaultLanes: ['output_summary', 'raw_ref_check', 'token_ledger'],
    requiredSkills: ['matt-diagnose', 'kb-retriever-lite'],
    writeScope: ['summary packets', 'cache-pool packets'],
    forbidden: ['drop exit codes', 'hide failure details', 'enable global hooks without approval'],
  },
]);

export function listProfiles(options = {}) {
  const profiles = PROFILE_DEFS
    .map((profile) => normalizeProfile(profile, options.projectRoot || DEFAULT_PROJECT_ROOT))
    .filter((profile) => !options.boardType || profile.boardType === options.boardType);
  return {
    ok: true,
    schemaVersion: 1,
    requiredReasoningEffort: REQUIRED_REASONING_EFFORT,
    profileCount: profiles.length,
    profiles,
  };
}

export function getProfile(profileId, options = {}) {
  const needle = normalizeKey(profileId);
  const profile = PROFILE_DEFS.find((item) => normalizeKey(item.profileId) === needle || normalizeKey(item.functionalName) === needle);
  if (!profile) throw new Error(`Unknown CCOW subagent profile: ${profileId}`);
  return normalizeProfile(profile, options.projectRoot || DEFAULT_PROJECT_ROOT);
}

export function buildGoalModeBrief(options = {}) {
  const profile = getProfile(options.profileId, { projectRoot: options.projectRoot });
  const goalId = requiredSafeId(options.goalId, 'goalId');
  const runId = requiredSafeId(options.runId, 'runId');
  const wtId = requiredSafeId(options.wtId, 'wtId');
  const lwId = requiredSafeId(options.lwId || `LW-${profile.functionalName}`, 'lwId');
  const cachePoolRoot = options.cachePoolRoot || `.codex/ccow-cache-pool/${goalId}/${runId}`;
  return [
    'GOAL MODE ON',
    `goalId: ${goalId}`,
    `runId: ${runId}`,
    `wtId: ${wtId}`,
    `lwId: ${lwId}`,
    `profileId: ${profile.profileId}`,
    `functionalName: ${profile.functionalName}`,
    `boardType: ${profile.boardType}`,
    `reasoning_effort=${REQUIRED_REASONING_EFFORT}`,
    `cachePoolRoot: ${cachePoolRoot}`,
    'cachePoolRequired: true',
    'goalCompletionAuthority: Coordinator only',
    '',
    `Role: ${profile.functionalName} is the LW for this WT. Emphasize the goal, route work to W lanes, write started/heartbeat/final packets, and report only compact packets.`,
    `Responsibilities: ${profile.responsibilities.join('; ')}`,
    `Default lanes: ${profile.defaultLanes.join(', ')}`,
    `Allowed write scope: ${profile.writeScope.join('; ')}`,
    `Forbidden: ${profile.forbidden.join('; ')}`,
    '',
    'Output packet JSON fields: profileId, wtId, lwId, status, summary, findings, blockers, nextActions, changedFiles, evidenceRefs, verdict.',
    'Do not mark the overall goal complete. Do not start services, install dependencies, or mutate global config unless the Coordinator explicitly approves it.',
    options.task ? `\nTask:\n${options.task}` : '',
  ].filter(Boolean).join('\n');
}

export function buildSpawnPayload(options = {}) {
  const profile = getProfile(options.profileId, { projectRoot: options.projectRoot });
  const prompt = buildGoalModeBrief(options);
  const items = [
    ...profile.skillItems,
    { type: 'text', text: prompt },
  ];
  return {
    ok: true,
    agent_type: options.agentType || defaultAgentType(profile),
    reasoning_effort: REQUIRED_REASONING_EFFORT,
    profileId: profile.profileId,
    functionalName: profile.functionalName,
    goalMode: true,
    cachePoolRequired: true,
    items,
    prompt,
  };
}

export function validateProfiles(options = {}) {
  const profiles = listProfiles({ projectRoot: options.projectRoot }).profiles;
  const violations = [];
  for (const profile of profiles) {
    if (profile.reasoningEffort !== REQUIRED_REASONING_EFFORT) violations.push(`${profile.profileId}: reasoning must be xhigh`);
    if (!profile.goalMode || !profile.cachePoolRequired) violations.push(`${profile.profileId}: goalMode/cachePoolRequired must be true`);
    for (const skill of BASELINE_SKILLS) {
      if (!profile.skills.includes(skill)) violations.push(`${profile.profileId}: missing baseline skill ${skill}`);
    }
    if (!profile.skillItems.length) violations.push(`${profile.profileId}: no skill items resolved`);
  }
  return {
    ok: violations.length === 0,
    checkedAt: new Date().toISOString(),
    profileCount: profiles.length,
    violations,
  };
}

function normalizeProfile(profile, projectRoot) {
  const skills = unique([...BASELINE_SKILLS, ...(profile.requiredSkills || []), ...(profile.optionalSkills || [])]);
  return {
    schemaVersion: 1,
    ...profile,
    reasoningEffort: REQUIRED_REASONING_EFFORT,
    goalMode: true,
    cachePoolRequired: true,
    skillPackId: 'codex-baseline-xhigh',
    skills,
    skillItems: skills.map((skill) => skillItem(skill, projectRoot)).filter(Boolean),
    packetSchema: {
      required: ['schemaVersion', 'goalId', 'runId', 'wtId', 'lwId', 'packetType', 'status', 'summary', 'createdAt'],
      packetTypes: ['started', 'heartbeat', 'w_packet', 'wt_packet', 'error', 'blocked', 'needs_human', 'handoff', 'final'],
    },
  };
}

function skillItem(skill, projectRoot) {
  const candidates = [
    path.join(projectRoot, '.codex', 'skills', skill, 'SKILL.md'),
    path.join(process.env.USERPROFILE || 'C:/Users/Administrator', '.codex', 'skills', '.system', skill, 'SKILL.md'),
  ];
  if (skill === 'browser:control-in-app-browser') {
    candidates.push(path.join(process.env.USERPROFILE || 'C:/Users/Administrator', '.codex', 'plugins', 'cache', 'openai-bundled', 'browser', '26.601.21317', 'skills', 'control-in-app-browser', 'SKILL.md'));
  }
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) return null;
  return { type: 'skill', name: skill, path: file.replace(/\\/g, '/') };
}

function defaultAgentType(profile) {
  if (['ImplementationLead', 'DebugLead', 'ModelingLead', 'IntegrationLead'].includes(profile.profileId)) return 'worker';
  return 'explorer';
}

function requiredSafeId(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  if (!/^[A-Za-z0-9_.-]+$/u.test(text)) throw new Error(`${label} contains unsafe characters`);
  return text;
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_]+/gu, '-');
}

function unique(values) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
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
    '  node ccow-subagent-profiles.mjs list [--board-type <type>] [--project-root <dir>]',
    '  node ccow-subagent-profiles.mjs show --profile <id> [--project-root <dir>]',
    '  node ccow-subagent-profiles.mjs brief --profile <id> --goal-id <id> --run-id <id> --wt-id <id> [--lw-id <id>] [--task <text>]',
    '  node ccow-subagent-profiles.mjs spawn-payload --profile <id> --goal-id <id> --run-id <id> --wt-id <id> [--lw-id <id>] [--task <text>]',
    '  node ccow-subagent-profiles.mjs validate [--project-root <dir>]',
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
  if (args._ === 'list') {
    result = listProfiles({ projectRoot, boardType: args['board-type'] });
  } else if (args._ === 'show') {
    result = { ok: true, profile: getProfile(args.profile, { projectRoot }) };
  } else if (args._ === 'brief') {
    result = { ok: true, prompt: buildGoalModeBrief({ ...args, projectRoot, profileId: args.profile, goalId: args['goal-id'], runId: args['run-id'], wtId: args['wt-id'], lwId: args['lw-id'] }) };
  } else if (args._ === 'spawn-payload') {
    result = buildSpawnPayload({ ...args, projectRoot, profileId: args.profile, goalId: args['goal-id'], runId: args['run-id'], wtId: args['wt-id'], lwId: args['lw-id'] });
  } else if (args._ === 'validate') {
    result = validateProfiles({ projectRoot });
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
