import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {
  buildCurrentFactIndex,
  currentFactSupersededIdSet,
  ensureStore,
  listArchives,
  recall,
  storePaths,
} from './am-local-store.mjs';

const IMPORTANCE_WEIGHT = { critical: 1, high: 0.86, normal: 0.58, low: 0.34 };
const LAYER_WEIGHT = { semantic: 0.82, procedural: 0.78, episodic: 0.62, diagnostic: 0.7 };
const PROJECT_CLASSIFICATION_THRESHOLD = 5;
const DEPLOYED_PROJECTS = [
  {
    id: 'am-local-memory-platform',
    name: 'AM Local Memory Platform',
    kind: 'memory_platform',
    status: 'active',
    description: 'Local file + stdio MCP memory platform with recall, goals, maintenance, and static console.',
    evidenceFiles: ['.codex/tools/am-local-store.mjs', '.codex/tools/am-local-mcp.mjs', '.codex/tools/am-vnext.mjs', '.codex/tools/am-local-viewer-export.mjs'],
    keywords: ['agentmemory', 'am-local', 'am console', 'am vnext', 'am goal', 'am watchdog', 'am reflection', 'memory_recall', 'memory_health', 'memory_cleanup', 'memory_index', 'memory project board', 'project-board', 'deployment-projects', 'deploymentProjectId', 'deployed-project', 'local memory', 'no-port', 'stdio mcp', 'goal_status', 'goal board', 'encoding warnings'],
  },
  {
    id: 'am-conversation-archive',
    name: 'AM Archive / Cross-Project Memory',
    kind: 'memory_archive',
    status: 'active',
    description: 'Full conversation archives, consolidated archive-backed memories, and cross-project session summaries owned by AM.',
    evidenceFiles: ['.codex/conversation-archive', '.codex/memory/am/memories.jsonl', '.codex/memory/am/am-health-report.json'],
    keywords: ['conversation_archive', 'conversation archive', 'conversation-summary', 'conversation summary', 'consolidated_memory', 'consolidated memory', 'conversation-archive', 'codex-session', 'codex-desktop', 'archive-backed', 'session archive', 'cross-project'],
  },
  {
    id: 'ccow-swarm-workbench',
    name: 'CCOW Swarm Workbench',
    kind: 'multi_agent_workbench',
    status: 'lab',
    description: 'Observable multi-agent swarm workbench, W review flow, task graph, blackboard, and recovery ideas.',
    evidenceFiles: ['ccow-runs', '_archive/ccow-runs', '.codex/knowledge-assets/agent-orchestration/swarm-ide.md'],
    keywords: ['ccow', 'swarm', 'swarm-ide', 'w-confirmation', 'w-compare', 'w-style', 'blackboard', 'task graph', 'multi-agent', 'coordinator', 'recovery queue', 'ag-ui'],
  },
  {
    id: 'agent-orchestration-knowledge-assets',
    name: 'Agent Orchestration Knowledge Assets',
    kind: 'knowledge_assets',
    status: 'deployed',
    description: 'Local source notes for third-party agent/orchestration projects kept as knowledge assets instead of active services.',
    evidenceFiles: ['.codex/knowledge-assets/agent-orchestration', '.codex/knowledge-assets/pi-agent', '.codex/knowledge-assets/superpowers', 'THIRD_PARTY_AGENT_SKILLS_DEPLOYMENT.md'],
    keywords: ['agent-orchestration', 'third-party agent', 'knowledge asset', 'research asset', 'claude-agent-examples', 'clawswarm', 'swarm-ide', 'pi-agent', 'superpowers', 'openagent', 'openAgent', 'mem0', 'letta', 'zep', 'graphrag', 'ag-ui', 'mission control', 'open-multi-agent'],
  },
  {
    id: 'external-capability-registry',
    name: 'External Capability Registry',
    kind: 'shared_knowledge_registry',
    status: 'deployed',
    description: 'No-port registry that routes third-party project mechanisms to CCOW, AM, Codex self workflow, and other local projects without copying external source.',
    evidenceFiles: ['.codex/tools/external-capability-registry.mjs', '.codex/tools/third-party-absorb.mjs', '.codex/knowledge-assets/third-party-skill-assets.json'],
    keywords: ['external capability registry', 'third-party-skill-assets', 'third party absorb', 'wCapabilityCards', 'capability cards', 'mindgraph', 'project-graph', 'multi-agent-playground', 'multica', 'paperclip', 'claude-agent-examples', 'emperor-agent', 'mem0', 'letta', 'zep', 'graphrag', 'mission control', 'ag-ui', 'openagent', 'aigameanent', 'wenzagent', 'video-podcast-maker', 'headroom', 'rtk', 'lean-ctx', 'whetstone', 'workflow-preset-library', 'agent-team-governance', 'file-backed-agent-inbox', 'context-compression-stack', 'cli-output-compression', 'video-podcast-pipeline', 'context-os-governance', 'codex_self', 'other_projects', 'shared registry', 'no-port knowledge asset'],
  },
  {
    id: 'example-place-example-house-blank-3d-world',
    name: 'Palace Villa / blank-3d-world (archived)',
    kind: 'archived_godot_blender_project',
    status: 'archived',
    description: 'Cancelled Godot/Blender asset rebuild preserved as archived evidence and reusable modeling workflow lessons.',
    evidenceFiles: ['_archive/cancelled-godot-projects', '.codex/memory/am/memories.jsonl'],
    keywords: ['example-place example-house', 'blank-3d-world', 'example-place-example-house-v003', 'pv_', 'v003', 'godot', 'blender', 'image2', 'gpt-image-2', 'glb', 'collision', 'runtime_evidence', 'acceptance_audit', 'web-design-engineer'],
  },
  {
    id: 'repo-context-mcp',
    name: 'Repo Context MCP',
    kind: 'mcp_tool',
    status: 'deployed',
    description: 'Local repo context/index MCP used for structure, file targeting, and change analysis.',
    evidenceFiles: ['.codex/tools/repo-context-mcp.mjs', '.codex/start-repo-context-mcp.ps1'],
    keywords: ['repo-context', 'repo context', 'context_for_files', 'analyze_change', 'entrypoints', 'structure index', 'repo-context-mcp'],
  },
  {
    id: 'code-review-graph',
    name: 'Code Review Graph',
    kind: 'review_tool',
    status: 'deployed',
    description: 'Code graph and dependency-impact review workflow for deeper architecture/code review.',
    evidenceFiles: ['.codex/skills/code-review-graph', '.codex/tools/check-code-review-graph-mcp.ps1'],
    keywords: ['code-review-graph', 'code graph', 'dependency graph', 'impact analysis', 'architecture relationships', 'review graph'],
  },
  {
    id: 'skill-workflow-pack',
    name: 'Codex Skill Workflow Pack',
    kind: 'skills',
    status: 'deployed',
    description: 'Local skills for planning, diagnosis, TDD, review, PRD, vertical slices, project audit, and retrieval.',
    evidenceFiles: ['.codex/skills', '.codex/skills/planning-with-files', '.codex/skills/matt-diagnose', '.codex/skills/vertical-slice-planning'],
    keywords: ['skill', 'skills', 'planning-with-files', 'matt-diagnose', 'matt-tdd', 'superpowers-lite', 'vertical-slice', 'prd', 'third-party-project-audit', 'kb-retriever', 'skill-catalog', 'garden-skills', 'hermes-skill-atlas', 'external-skill-catalog'],
  },
  {
    id: 'paperclip-workflow',
    name: 'Paperclip Workflow',
    kind: 'planning_workflow',
    status: 'knowledge_asset',
    description: 'Local Paperclip-style issue, goal, approval, and cost-dashboard planning workflow.',
    evidenceFiles: ['.codex/skills/paperclip-workflow'],
    keywords: ['paperclip', 'issue tracker', 'goal management', 'approvals', 'cost dashboard', 'agent orchestration'],
  },
  {
    id: 'codex-local-template',
    name: 'Codex Local Template / MCP Base',
    kind: 'template_tooling',
    status: 'deployed',
    description: 'Local Codex hooks, MCP launchers, automation bridge, and no-port template/runtime guardrails.',
    evidenceFiles: ['.codex/hooks', '.codex/start-am-mcp.ps1', '.codex/start-agentmemory-mcp.ps1', '.codex/tools/check-mcp-port-plan.ps1'],
    keywords: ['codex template', 'mcp base', 'hooks', 'userprompt', 'stop hook', 'automation bridge', 'port plan', 'start-agentmemory-mcp', 'start-am-mcp'],
  },
];

export async function buildMemoryIndex(projectRoot, options = {}) {
  const paths = await ensureStore(projectRoot);
  const tombstones = await readJsonl(paths.tombstones);
  const tombstoned = new Set(tombstones.map((item) => item?.targetId).filter(Boolean));
  const allMemoryRecords = await readJsonl(paths.memories);
  const rawMemoryCount = allMemoryRecords.filter((record) => record?.kind === 'memory').length;
  const memories = allMemoryRecords
    .filter((record) => record?.kind === 'memory')
    .filter((record) => !tombstoned.has(record.id))
    .map((record, index) => normalizeIndexedMemory(record, index, projectRoot));
  const duplicateGroups = findDuplicateGroups(memories);
  const duplicateById = new Map();
  for (const group of duplicateGroups) {
    for (const item of group.items) {
      duplicateById.set(item.id, group);
    }
  }
  annotateCoveredMemories(memories);
  for (const memory of memories) {
    memory.quality = scoreMemoryQuality(memory, duplicateById.get(memory.id));
  }
  const goals = await buildGoalBoard(projectRoot, { write: options.write !== false });
  const projectBoard = await buildProjectBoard(projectRoot, { memories, goals, write: options.write !== false });
  const health = await buildHealthReport(projectRoot, { memories, allMemoryRecords, rawMemoryCount, tombstones, goals, duplicateGroups, write: options.write !== false });
  const cleanup = buildCleanupDryRun({ memories, rawMemoryCount, duplicateGroups, health, goals });
  const currentFacts = buildCurrentFactIndex(memories);
  const index = {
    ok: true,
    generatedAt: new Date().toISOString(),
    projectRoot: path.resolve(projectRoot),
    store: paths.root,
    stats: {
      memories: memories.length,
      rawMemories: rawMemoryCount,
      tombstones: tombstones.length,
      duplicateGroups: duplicateGroups.length,
      coveredMemories: memories.filter((memory) => memory.coveredBy).length,
      encodingWarnings: health.encodingWarnings.length,
      orphanResumePackets: health.orphanResumePackets.length,
      staleGoals: health.staleGoals.length,
      oversizedArchiveBacked: health.oversizedArchiveBacked.length,
      deploymentProjects: projectBoard.projects.length,
      assignedDeploymentMemories: projectBoard.summary.assignedMemories,
      primaryAssignedDeploymentMemories: projectBoard.summary.primaryAssignedMemories,
      unassignedProjectMemories: projectBoard.unassigned.count,
      currentFacts: Object.keys(currentFacts.facts || {}).length,
      supersededCurrentFacts: currentFacts.supersededIds.length,
      portsRequired: false,
    },
    facets: buildFacets(memories),
    memories,
    duplicateGroups,
    goals,
    projectBoard,
    health,
    cleanup,
    currentFacts,
  };
  if (options.write !== false) {
    await writeIndex(paths, index);
  }
  return limitIndex(index, options);
}

export async function enhancedRecall(projectRoot, options = {}) {
  const query = String(options.query || options.q || '').trim();
  const limit = clampInt(options.limit, 1, 50, 8);
  const index = await buildMemoryIndex(projectRoot, { write: true, includeMemories: true, memoryLimit: 10000 });
  const projectFilter = String(options.project || '').toLowerCase();
  const deploymentFilter = String(options.deploymentProject || options.projectId || options.projectBucket || '').toLowerCase();
  const conceptFilter = splitList(options.concepts || options.concept).map((item) => item.toLowerCase());
  const sourceFilter = String(options.source || '').toLowerCase();
  const fileFilter = String(options.file || options.path || '').toLowerCase();
  const base = await recall(projectRoot, { query, limit: Math.max(50, limit * 8), enhanced: false });
  const baseScores = new Map((base.results || []).map((item) => [item.observation?.id, Number(item.score || 0)]));
  const queryTokens = tokenize(query);
  const supersededIds = currentFactSupersededIdSet(index.currentFacts);
  const showSuperseded = isHistoryContextQuery(queryTokens, query);
  const scored = index.memories
    .filter((memory) => showSuperseded || !supersededIds.has(String(memory.id || '')))
    .filter((memory) => !projectFilter || String(memory.project || '').toLowerCase().includes(projectFilter))
    .filter((memory) => !deploymentFilter || (memory.deploymentProjects || []).some((project) => String(project.id || '').toLowerCase() === deploymentFilter || String(project.name || '').toLowerCase().includes(deploymentFilter)))
    .filter((memory) => !sourceFilter || String(memory.sourceKind || '').toLowerCase().includes(sourceFilter))
    .filter((memory) => !fileFilter || memory.filesText.includes(fileFilter))
    .filter((memory) => !conceptFilter.length || conceptFilter.some((concept) => memory.concepts.map((item) => item.toLowerCase()).includes(concept)))
    .map((memory) => scoreRecallMemory(memory, queryTokens, baseScores.get(memory.id) || 0, query))
    .filter((item) => item.score > 0 || !queryTokens.length)
    .sort((a, b) => b.score - a.score || b.memory.quality.overall - a.memory.quality.overall || String(b.memory.timestamp || '').localeCompare(String(a.memory.timestamp || '')));
  const deduped = dedupeRecall(scored);
  return {
    ok: true,
    mode: 'enhanced',
    query,
    total: index.memories.length,
    returned: Math.min(limit, deduped.length),
    filters: { project: projectFilter, deploymentProject: deploymentFilter, concepts: conceptFilter, source: sourceFilter, file: fileFilter },
    results: deduped.slice(0, limit).map((item) => ({
      score: Number(item.score.toFixed(4)),
      why: item.why,
      quality: item.memory.quality,
      deploymentProjects: item.memory.deploymentProjects,
      primaryDeploymentProject: item.memory.primaryDeploymentProject,
      observation: recallObservation(item.memory),
    })),
  };
}

export async function buildHealthReport(projectRoot, context = {}) {
  const paths = await ensureStore(projectRoot);
  const allMemoryRecords = context.allMemoryRecords || await readJsonl(paths.memories);
  const memories = context.memories || allMemoryRecords.filter((record) => record?.kind === 'memory').map((record, index) => normalizeIndexedMemory(record, index, projectRoot));
  const rawMemoryCount = context.rawMemoryCount ?? allMemoryRecords.filter((record) => record?.kind === 'memory').length;
  annotateCoveredMemories(memories);
  const goals = context.goals || await buildGoalBoard(projectRoot, { write: context.write !== false });
  const duplicateGroups = context.duplicateGroups || findDuplicateGroups(memories);
  const archives = await listArchives(projectRoot, 10000);
  const files = await fileSizes(paths);
  const encodingWarnings = memories
    .filter((memory) => memory.encodingWarning)
    .slice(0, 240)
    .map((memory) => ({
      id: memory.id,
      title: memory.title,
      sourcePath: memory.sourcePath,
      sourceKind: memory.sourceKind,
      sample: encodingDamageSample(memory.damageText),
      severity: findEncodingDamage(memory.damageText).some((item) => item.severity === 'high') ? 'high' : 'medium',
    }));
  const oversizedArchiveBacked = memories
    .filter((memory) => /conversation_archive|archive-backed|conversation-summary/iu.test(`${memory.type} ${memory.sourceKind} ${memory.title}`) && memory.contentLength > 18000)
    .slice(0, 80)
    .map((memory) => ({ id: memory.id, title: memory.title, contentLength: memory.contentLength, sourcePath: memory.sourcePath }));
  const resumePackets = await readJsonl(paths.goalResumePackets);
  const latestGoalIds = new Set(goals.items.map((goal) => goal.id));
  const orphanResumePackets = resumePackets
    .filter((packet) => packet?.kind === 'goal_resume_packet' && packet.goalId && !latestGoalIds.has(packet.goalId))
    .slice(0, 80)
    .map((packet) => ({ id: packet.id, goalId: packet.goalId, status: packet.status, reason: packet.reason || packet.resumeTrigger || '' }));
  const staleGoals = goals.items
    .filter((goal) => goal.status === 'active' && daysSince(goal.updatedAt || goal.createdAt) > 7)
    .map((goal) => ({ id: goal.id, title: goal.title, updatedAt: goal.updatedAt, daysStale: Math.round(daysSince(goal.updatedAt || goal.createdAt)) }));
  const parseErrors = allMemoryRecords.filter((record) => record?.kind === 'parse_error').length;
  const allCoveredMemories = memories.filter((memory) => memory.coveredBy);
  const coveredMemories = allCoveredMemories
    .slice(0, 120)
    .map((memory) => ({
      id: memory.id,
      title: memory.title,
      timestamp: memory.timestamp,
      coveredBy: memory.coveredBy,
    }));
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    projectRoot: path.resolve(projectRoot),
    store: paths.root,
    portsRequired: false,
    counts: {
      memories: memories.length,
      rawMemories: rawMemoryCount,
      archives: archives.length,
      duplicateGroups: duplicateGroups.length,
      encodingWarnings: encodingWarnings.length,
      orphanResumePackets: orphanResumePackets.length,
      staleGoals: staleGoals.length,
      oversizedArchiveBacked: oversizedArchiveBacked.length,
      coveredMemories: allCoveredMemories.length,
      parseErrors,
    },
    files,
    encodingWarnings,
    duplicateGroups: duplicateGroups.slice(0, 80),
    orphanResumePackets,
    staleGoals,
    oversizedArchiveBacked,
    coveredMemories,
    recommendations: buildHealthRecommendations({ encodingWarnings, duplicateGroups, orphanResumePackets, staleGoals, oversizedArchiveBacked, coveredMemories: allCoveredMemories, files }),
  };
  if (context.write !== false) {
    await writeJsonFile(path.join(paths.root, 'am-health-report.json'), report);
  }
  return report;
}

export async function cleanupDryRun(projectRoot, options = {}) {
  const index = await buildMemoryIndex(projectRoot, { write: options.write !== false, includeMemories: true });
  const limit = clampInt(options.limit, 1, 500, 160);
  const plan = {
    ok: true,
    dryRun: true,
    generatedAt: new Date().toISOString(),
    projectRoot: path.resolve(projectRoot),
    note: 'No AM data was modified. Actions are recommendations only.',
    actions: index.cleanup.actions.slice(0, limit),
    summary: index.cleanup.summary,
  };
  const paths = storePaths(projectRoot);
  if (options.write !== false) {
    await writeJsonFile(path.join(paths.root, 'am-cleanup-dry-run.json'), plan);
  }
  return plan;
}

export async function buildGoalBoard(projectRoot, options = {}) {
  const paths = await ensureStore(projectRoot);
  const rawGoals = await readJsonl(paths.goals);
  const goalEvents = (await readJsonl(paths.goalEvents)).filter((item) => item?.kind === 'goal_event');
  const goalWatchdog = (await readJsonl(paths.goalWatchdog)).filter((item) => item?.kind === 'goal_watchdog');
  const resumePackets = (await readJsonl(paths.goalResumePackets)).filter((item) => item?.kind === 'goal_resume_packet');
  const latestGoals = latestGoalSnapshots(rawGoals);
  const byGoal = groupBy(goalEvents, 'goalId');
  const watchdogByGoal = groupBy(goalWatchdog, 'goalId');
  const resumeByGoal = groupBy(resumePackets, 'goalId');
  const items = latestGoals.map((goal) => {
    const events = (byGoal.get(goal.id) || []).sort(descTime).slice(0, 40);
    const watchdog = (watchdogByGoal.get(goal.id) || []).sort(descTime);
    const packets = latestById(resumeByGoal.get(goal.id) || []);
    const latestAudit = watchdog.find((item) => item.type === 'completion_audit') || null;
    const openPackets = packets.filter((item) => item.status === 'open');
    const missing = [
      ...(latestAudit && latestAudit.status !== 'PASS' ? latestAudit.missingCriteria || [] : []),
      ...openPackets.flatMap((packet) => packet.missing || packet.missingCriteria || []),
    ].map(String).filter(Boolean);
    return {
      id: goal.id,
      title: goal.title || '(untitled goal)',
      objective: goal.objective || '',
      status: goal.status || 'active',
      projectRoot: goal.projectRoot || '',
      createdAt: goal.createdAt || '',
      updatedAt: goal.updatedAt || '',
      progressSummary: goal.progressSummary || '',
      nextActions: Array.isArray(goal.nextActions) ? goal.nextActions : [],
      successCriteria: Array.isArray(goal.successCriteria) ? goal.successCriteria : [],
      evidenceRefs: Array.isArray(goal.evidenceRefs) ? goal.evidenceRefs : [],
      archiveRefs: Array.isArray(goal.archiveRefs) ? goal.archiveRefs : [],
      latestCheckpoint: events.find((item) => item.eventType === 'checkpoint') || events[0] || null,
      latestCompletionAudit: latestAudit,
      completionAllowed: latestAudit?.status === 'PASS',
      missingCriteria: unique(missing),
      openResumePackets: openPackets,
      resolvedResumePackets: packets.filter((item) => item.status === 'resolved').slice(0, 12),
      events,
    };
  }).sort((a, b) => statusRank(a.status) - statusRank(b.status) || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  const board = {
    ok: true,
    generatedAt: new Date().toISOString(),
    active: items.filter((item) => item.status === 'active'),
    blocked: items.filter((item) => item.status === 'blocked'),
    completed: items.filter((item) => item.status === 'completed'),
    items,
  };
  if (options.write !== false) {
    await writeJsonFile(path.join(paths.root, 'am-goal-board.json'), board);
  }
  return board;
}

export async function buildProjectBoard(projectRoot, context = {}) {
  const paths = await ensureStore(projectRoot);
  let memories = context.memories;
  if (!memories) {
    const tombstones = await readJsonl(paths.tombstones);
    const tombstoned = new Set(tombstones.map((item) => item?.targetId).filter(Boolean));
    memories = (await readJsonl(paths.memories))
      .filter((record) => record?.kind === 'memory' && !tombstoned.has(record.id))
      .map((record, index) => normalizeIndexedMemory(record, index, projectRoot));
    const duplicateById = new Map();
    for (const group of findDuplicateGroups(memories)) {
      for (const item of group.items) duplicateById.set(item.id, group);
    }
    annotateCoveredMemories(memories);
    for (const memory of memories) {
      memory.quality = scoreMemoryQuality(memory, duplicateById.get(memory.id));
    }
  }
  const goals = context.goals || await buildGoalBoard(projectRoot, { write: context.write !== false });
  for (const memory of memories) {
    const matches = classifyDeploymentProjects(memory);
    memory.deploymentProjects = matches.map((match) => ({
      id: match.project.id,
      name: match.project.name,
      score: Number(match.score.toFixed(2)),
      reasons: match.reasons.slice(0, 5),
    }));
    memory.primaryDeploymentProject = memory.deploymentProjects[0] || null;
  }
  const projects = DEPLOYED_PROJECTS.map((project) => {
    const assigned = memories.filter((memory) => (memory.deploymentProjects || []).some((match) => match.id === project.id));
    const primary = assigned.filter((memory) => memory.primaryDeploymentProject?.id === project.id);
    const projectGoals = (goals.items || []).filter((goal) => classifyDeploymentProjects(goalAsMemory(goal, projectRoot)).some((match) => match.project.id === project.id));
    return {
      id: project.id,
      name: project.name,
      kind: project.kind,
      status: project.status,
      description: project.description,
      counts: {
        memories: assigned.length,
        primaryMemories: primary.length,
        highImportance: assigned.filter((memory) => ['critical', 'high'].includes(memory.importance)).length,
        encodingWarnings: assigned.filter((memory) => memory.encodingWarning).length,
        coveredMemories: assigned.filter((memory) => memory.coveredBy).length,
        downrankCandidates: assigned.filter((memory) => memory.quality?.recommendation === 'downrank').length,
        archiveBacked: assigned.filter((memory) => isArchiveBacked(memory)).length,
      },
      evidenceFiles: project.evidenceFiles.map((file) => ({
        path: file,
        exists: fs.existsSync(path.resolve(projectRoot, file)),
      })),
      topConcepts: topCounts(assigned.flatMap((memory) => memory.concepts), 12),
      sourceKinds: topCounts(assigned.map((memory) => memory.sourceKind), 10),
      goals: projectGoals.slice(0, 8).map((goal) => ({
        id: goal.id,
        title: goal.title,
        status: goal.status,
        updatedAt: goal.updatedAt || goal.createdAt || '',
        completionAllowed: Boolean(goal.completionAllowed),
        openResumePackets: Array.isArray(goal.openResumePackets) ? goal.openResumePackets.length : 0,
      })),
      latestMemories: assigned
        .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
        .slice(0, 12)
        .map(projectMemorySummary),
    };
  }).sort((a, b) => b.counts.memories - a.counts.memories || a.name.localeCompare(b.name));
  const assignedIds = new Set(memories.filter((memory) => (memory.deploymentProjects || []).length).map((memory) => memory.id));
  const primaryAssignedIds = new Set(memories.filter((memory) => memory.primaryDeploymentProject).map((memory) => memory.id));
  const unassignedMemories = memories.filter((memory) => !assignedIds.has(memory.id));
  const summary = {
    memories: memories.length,
    assignedMemories: assignedIds.size,
    primaryAssignedMemories: primaryAssignedIds.size,
    unassignedMemories: unassignedMemories.length,
    assignedPercent: memories.length ? Number(((assignedIds.size / memories.length) * 100).toFixed(1)) : 0,
    classificationThreshold: PROJECT_CLASSIFICATION_THRESHOLD,
    organization: 'derived_non_destructive',
    note: 'Memories are grouped by deployed project from metadata, evidence paths, concepts, and low-weight archive content. Historical records are not rewritten.',
  };
  const board = {
    ok: true,
    generatedAt: new Date().toISOString(),
    projectRoot: path.resolve(projectRoot),
    portsRequired: false,
    summary,
    taxonomy: DEPLOYED_PROJECTS.map((project) => ({
      id: project.id,
      name: project.name,
      kind: project.kind,
      status: project.status,
      description: project.description,
      evidenceFiles: project.evidenceFiles,
      keywords: project.keywords,
    })),
    projects,
    unassigned: {
      count: unassignedMemories.length,
      topConcepts: topCounts(unassignedMemories.flatMap((memory) => memory.concepts), 20),
      sourceKinds: topCounts(unassignedMemories.map((memory) => memory.sourceKind), 20),
      latestMemories: unassignedMemories
        .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
        .slice(0, 20)
        .map(projectMemorySummary),
    },
  };
  if (context.write !== false) {
    await writeJsonFile(path.join(paths.root, 'am-project-board.json'), board);
  }
  return board;
}

function normalizeIndexedMemory(record, index, projectRoot) {
  const source = record.source || {};
  const metadata = record.metadata || {};
  const content = String(record.content || record.summary || '');
  const title = String(record.title || firstLine(content) || `Memory ${index + 1}`);
  const sourcePath = String(source.path || source.file || record.files?.[0] || '');
  const files = Array.isArray(record.files) ? record.files.map(String) : [];
  const concepts = Array.isArray(record.concepts) ? record.concepts.map(String).filter(Boolean) : [];
  const metadataText = metadataToText(metadata);
  const summary = String(record.summary || '');
  const searchableContent = excerpt(content, '', isArchiveLikeRecord(record) ? 1800 : 6000);
  const contentPreview = excerpt(content, '', 700);
  const type = String(record.type || 'memory');
  const damageText = [
    title,
    summary,
    contentPreview,
    record.project,
    source.kind,
    source.path,
    metadataText,
    ...concepts,
    ...files,
  ].join('\n');
  return {
    id: record.id || `memory-${index + 1}`,
    index,
    timestamp: record.timestamp || '',
    title,
    summary,
    content: contentPreview,
    contentPreview,
    contentLength: content.length,
    type,
    layer: String(record.layer || 'semantic'),
    importance: String(record.importance || 'normal'),
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : 0.75,
    reusable: type === 'am_first_stage_summary' ? false : Boolean(record.reusable),
    needsVerification: Boolean(record.needsVerification || record.needs_verification),
    project: String(record.project || ''),
    sourceKind: String(source.kind || record.sourceKind || record.type || 'local'),
    sourcePath,
    files,
    filesText: [sourcePath, ...files].join('\n').toLowerCase(),
    concepts,
    metadata: compactMetadata(metadata),
    currentFor: firstString(metadata.currentFor, metadata.current_for, record.currentFor, record.current_for),
    supersedes: unique([...splitList(metadata.supersedes), ...splitList(metadata.supersedesIds), ...splitList(metadata.supersededIds), ...splitList(record.supersedes), ...splitList(record.supersedesIds)]),
    supersededBy: unique([...splitList(metadata.supersededBy), ...splitList(metadata.superseded_by), ...splitList(record.supersededBy), ...splitList(record.superseded_by)]),
    validFrom: metadata.validFrom || record.validFrom || '',
    validTo: metadata.validTo || record.validTo || '',
    status: String(metadata.status || record.status || ''),
    explicitDeploymentProjectIds: explicitDeploymentProjectIds(record),
    text: [title, summary, searchableContent, record.project, source.kind, source.path, metadataText, ...concepts, ...files].join('\n').toLowerCase(),
    textHash: hashText(normalizeComparableText(content || title)),
    titleHash: hashText(normalizeComparableText(title)),
    damageText,
    encodingWarning: findEncodingDamage(damageText).length > 0,
    parseError: record.kind === 'parse_error',
    projectRoot: path.resolve(projectRoot),
    coveredBy: null,
    deploymentProjects: [],
    primaryDeploymentProject: null,
  };
}

function scoreMemoryQuality(memory, duplicateGroup) {
  let score = 100;
  const reasons = [];
  const sourceStrength = sourceStrengthScore(memory);
  if (sourceStrength < 0.5) {
    score -= 12;
    reasons.push('weak_source');
  }
  if (memory.encodingWarning) {
    score -= 25;
    reasons.push('encoding_warning');
  }
  if (duplicateGroup && duplicateGroup.items.length > 1 && duplicateGroup.primaryId !== memory.id) {
    score -= 20;
    reasons.push('duplicate_non_primary');
  }
  if (memory.needsVerification || isImplicitVerificationMemory(memory)) {
    score -= 10;
    reasons.push('needs_verification');
  }
  if (memory.contentLength > 30000) {
    score -= 8;
    reasons.push('oversized');
  }
  if (memory.coveredBy) {
    score -= 14;
    reasons.push('covered_by_newer_memory');
  }
  const age = daysSince(memory.timestamp);
  if (age > 90 && !memory.reusable && memory.layer === 'episodic') {
    score -= 8;
    reasons.push('old_episodic');
  }
  if (memory.importance === 'critical' || memory.importance === 'high') score += 6;
  if (memory.reusable) score += 4;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    overall: score,
    sourceStrength,
    duplicateCount: duplicateGroup ? duplicateGroup.items.length : 1,
    stale: age > 90,
    ageDays: Number.isFinite(age) ? Math.round(age) : null,
    reasons,
    recommendation: qualityRecommendation(score, reasons),
  };
}

function scoreRecallMemory(memory, queryTokens, baseScore, rawQuery = '') {
  let score = baseScore;
  const why = [];
  if (!queryTokens.length) {
    score += 0.1;
    why.push('recent/default recall');
  }
  for (const token of queryTokens) {
    if (String(memory.id || '').toLowerCase().includes(token)) {
      score += 5;
      why.push(`id:${token}`);
    } else if (String(memory.type || '').toLowerCase().includes(token)) {
      score += 3.8;
      why.push(`type:${token}`);
    } else if (String(memory.layer || '').toLowerCase().includes(token)) {
      score += 3.4;
      why.push(`layer:${token}`);
    } else if (memory.title.toLowerCase().includes(token)) {
      score += 4;
      why.push(`title:${token}`);
    } else if (memory.concepts.some((concept) => concept.toLowerCase().includes(token))) {
      score += 3.2;
      why.push(`concept:${token}`);
    } else if (memory.filesText.includes(token)) {
      score += 2.8;
      why.push(`file:${token}`);
    } else if (memory.summary.toLowerCase().includes(token)) {
      score += 2.4;
      why.push(`summary:${token}`);
    } else if (memory.text.includes(token)) {
      score += 1.4;
      why.push(`content:${token}`);
    }
  }
  score += (IMPORTANCE_WEIGHT[memory.importance] || 0.5) * 1.6;
  score += (LAYER_WEIGHT[memory.layer] || 0.5);
  score += sourceStrengthScore(memory);
  score += Math.min(1.2, memory.quality.overall / 100);
  if (memory.quality.reasons.includes('duplicate_non_primary')) score -= 3;
  if (memory.quality.reasons.includes('covered_by_newer_memory')) score -= 1.8;
  if ((isArchiveDerivedRecallMemory(memory) || isAutoCloseoutRecallMemory(memory)) && !isHistoryContextQuery(queryTokens, rawQuery)) {
    return { memory, score: 0, why: ['history_memory_filtered'] };
  }
  if ((memory.needsVerification || isImplicitVerificationMemory(memory)) && !isVerificationContextQuery(queryTokens)) {
    return { memory, score: 0, why: ['needs_verification_filtered'] };
  }
  if (isStaleOperationalAccessNoise(memory, queryTokens, rawQuery)) {
    return { memory, score: 0, why: ['operational_access_stale_noise_filtered'] };
  }
  if (memory.encodingWarning && !isEncodingContextQuery(queryTokens)) {
    return { memory, score: 0, why: ['encoding_warning_filtered'] };
  }
  if (memory.encodingWarning) score -= 1.4;
  if (daysSince(memory.timestamp) < 14) score += 0.8;
  if (!why.length && baseScore > 0) why.push('legacy recall match');
  if (memory.importance === 'critical' || memory.importance === 'high') why.push(`importance:${memory.importance}`);
  if (memory.reusable) why.push('reusable');
  return { memory, score, why: unique(why).slice(0, 8) };
}

function isVerificationContextQuery(tokens = []) {
  const queryText = ` ${tokens.join(' ')} `;
  return /(^|\s)(draft|proposal|patch|pending|unverified|verify|verification|blocked|handoff|resume|partial)(\s|$)|待验证|未验证|未完成|未上线|预案|草案|补丁|阻塞|交接|恢复|继续|ssh\s+(blocked|pending|restore|resume|unverified)|ssh[-_\s]+blocked/iu.test(queryText);
}

function isEncodingContextQuery(tokens = []) {
  const queryText = ` ${tokens.join(' ')} `;
  return /(^|\s)(encoding|utf-8|utf8|mojibake|garbled|charset)(\s|$)|编码|乱码|乱碼|字符损坏|字符損壞/iu.test(queryText);
}

function isHistoryContextQuery(tokens = [], rawQuery = '') {
  const queryText = ` ${tokens.join(' ')} ${String(rawQuery || '').toLowerCase()} `;
  return /(^|\s)(history|archive|conversation|session|handoff|resume|previous|last)(\s|$)|上次|历史|歷史|归档|歸檔|对话|對話|会话|會話|交接|继续|繼續/iu.test(queryText);
}

function isOperationalAccessQuery(tokens = [], rawQuery = '') {
  const queryText = ` ${tokens.join(' ')} ${String(rawQuery || '').toLowerCase()} `;
  const hasAccessDetail = /(^|\s)(ssh|ip|port|username|user|password|credential|credentials|login|account|access)(\s|$)|端口|用户名|账号|账户|密码|凭据|登录|连接/iu.test(queryText);
  const hasTarget = /example-site|payment|example-service|example-user|103\.240|shop|服务器|主机|vps|server|host/iu.test(queryText);
  return hasAccessDetail && hasTarget;
}

function isOperationalAccessMemory(memory = {}) {
  const text = [
    memory.type,
    memory.title,
    ...(memory.concepts || []),
    ...(memory.files || []),
  ].join('\n').toLowerCase();
  return /server[-_\s]?access|ssh[-_\s]?access|server[-_\s]?credentials?|credentials?|login[-_\s]?(info|credentials?)|access[-_\s]?note|private[-_\s]?key|ssh[-_\s]?private[-_\s]?key|连接资料|登录资料|服务器资料|凭据|ssh\s*(私钥|密钥|private[-_\s]?key|key)|私钥路径|登录密钥|连接密钥|端口.*(用户名|账号|账户|密码)|username.*password|user.*password/iu.test(text);
}

function isStaleOperationalAccessNoise(memory = {}, tokens = [], rawQuery = '') {
  if (!isOperationalAccessQuery(tokens, rawQuery) || isHistoryContextQuery(tokens, rawQuery)) return false;
  if (isOperationalAccessMemory(memory)) return false;
  return true;
}

function isArchiveDerivedRecallMemory(memory = {}) {
  return /^(conversation_summary|consolidated_memory|conversation_archive)$/u.test(String(memory.type || ''))
    || /conversation_archive|archive-backed|conversation-summary|conversation_summary|consolidated_memory/iu.test(String(memory.sourceKind || ''));
}

function isAutoCloseoutRecallMemory(memory = {}) {
  return String(memory.type || '') === 'am_first_finish_summary';
}

function isImplicitVerificationMemory(memory = {}) {
  const type = String(memory.type || '');
  if (!/^(project_state|am_first_stage_summary|am_first_finish_summary)$/u.test(type)) return false;
  const text = [
    memory.title,
    memory.summary,
    memory.content,
    memory.text,
  ].join('\n');
  return /待验证|未验证|未完成|未上线|未部署|待上线|预案|草案|管理通道不通|ssh\s+(blocked|pending|timeout|unreachable)|ssh[-_\s]+blocked|blocked by ssh|not deployed|not yet deployed|pending verification|pending fix|patch prepared|prepared but not deployed|draft patch/iu.test(text);
}

function dedupeRecall(scored) {
  const seen = new Set();
  const output = [];
  for (const item of scored) {
    const key = recallDedupeKey(item.memory);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function recallObservation(memory) {
  return {
    id: memory.id,
    version: 1,
    kind: 'memory',
    timestamp: memory.timestamp,
    layer: memory.layer,
    type: memory.type,
    title: memory.title,
    summary: memory.summary || memory.contentPreview || '',
    content: memory.contentPreview || memory.summary || '',
    importance: memory.importance,
    confidence: memory.confidence,
    reusable: memory.reusable,
    needsVerification: memory.needsVerification,
    project: memory.project,
    source: {
      kind: memory.sourceKind,
      path: memory.sourcePath,
    },
    concepts: memory.concepts,
    files: memory.files,
  };
}

function recallDedupeKey(memory) {
  if (/archive-backed|conversation_summary|conversation_archive/iu.test(`${memory.type} ${memory.title}`)) {
    return `archive:${memory.sourcePath || memory.titleHash}`;
  }
  return `${memory.titleHash}:${memory.textHash}`;
}

function classifyDeploymentProjects(memory) {
  return DEPLOYED_PROJECTS
    .map((project) => {
      const result = scoreDeploymentProject(memory, project);
      return { project, score: result.score, reasons: result.reasons };
    })
    .filter((match) => match.score >= PROJECT_CLASSIFICATION_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name))
    .slice(0, 4);
}

function scoreDeploymentProject(memory, project) {
  const reasons = [];
  let score = 0;
  const explicitIds = (memory.explicitDeploymentProjectIds || []).map((item) => String(item || '').toLowerCase());
  if (explicitIds.includes(project.id.toLowerCase()) || explicitIds.includes(project.name.toLowerCase())) {
    score += 40;
    reasons.push('metadata:deploymentProjectId');
  }
  const title = String(memory.title || '').toLowerCase();
  const content = String(memory.text || memory.content || memory.summary || memory.objective || memory.progressSummary || '').toLowerCase();
  const typeText = `${memory.type || ''} ${memory.sourceKind || ''} ${memory.title || ''}`;
  const sourceText = `${memory.type || ''} ${memory.layer || ''} ${memory.sourceKind || ''}`.toLowerCase();
  const summaryLike = /conversation_summary|consolidated_memory/iu.test(typeText);
  const contentWeight = summaryLike ? 0.75 : isArchiveBacked(memory) ? 0.38 : 1.4;
  const concepts = (Array.isArray(memory.concepts) ? memory.concepts : []).map((item) => String(item || '').toLowerCase());
  const files = [
    memory.sourcePath,
    memory.projectRoot,
    ...(Array.isArray(memory.files) ? memory.files : []),
    ...(Array.isArray(memory.evidenceRefs) ? memory.evidenceRefs.map((ref) => ref?.path || ref?.summary || '') : []),
  ].join('\n').toLowerCase();
  for (const evidence of project.evidenceFiles) {
    const needle = evidence.toLowerCase().replace(/\\/g, '/');
    const fileText = files.replace(/\\/g, '/');
    if (fileText.includes(needle)) {
      score += 8;
      reasons.push(`file:${evidence}`);
    }
  }
  for (const keyword of project.keywords) {
    const needle = keyword.toLowerCase();
    if (!needle) continue;
    if (title.includes(needle)) {
      score += 5;
      reasons.push(`title:${keyword}`);
    }
    if (concepts.some((concept) => concept.includes(needle))) {
      score += 4;
      reasons.push(`concept:${keyword}`);
    }
    if (files.includes(needle)) {
      score += 4;
      reasons.push(`file:${keyword}`);
    }
    if (sourceText.includes(needle)) {
      score += 4;
      reasons.push(`source:${keyword}`);
    }
    if (contentWeight > 0 && content.includes(needle)) {
      score += contentWeight;
      if (reasons.length < 8) reasons.push(`content:${keyword}`);
    }
  }
  return { score, reasons: unique(reasons) };
}

function explicitDeploymentProjectIds(record) {
  const metadata = record?.metadata || {};
  return unique([
    metadata.deploymentProjectId,
    metadata.deployment_project_id,
    metadata.projectId,
    metadata.projectBucket,
    ...(Array.isArray(metadata.deploymentProjectIds) ? metadata.deploymentProjectIds : []),
    ...(Array.isArray(metadata.projectBuckets) ? metadata.projectBuckets : []),
  ].flat()
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim())
    .filter((value) => value && value.toLowerCase() !== 'undefined' && value.toLowerCase() !== 'null'));
}

function isArchiveLikeRecord(record = {}) {
  return /conversation_archive|archive-backed|conversation-summary|conversation_summary|consolidated_memory/iu.test([
    record.type,
    record.source?.kind,
    record.title,
  ].join(' '));
}

function compactMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 30)) {
    if (typeof value === 'string') {
      out[key] = excerpt(value, '', 500);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((item) => typeof item === 'string' ? excerpt(item, '', 200) : item);
    }
  }
  return out;
}

function metadataToText(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  return Object.entries(metadata)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value))
    .map(([key, value]) => `${key}:${Array.isArray(value) ? value.join(',') : value}`)
    .join('\n');
}

function isArchiveBacked(memory) {
  return /conversation_archive|archive-backed|conversation-summary|conversation_summary|consolidated_memory/iu.test(`${memory.type || ''} ${memory.sourceKind || ''} ${memory.title || ''}`);
}

function goalAsMemory(goal, projectRoot) {
  return {
    id: goal.id,
    title: goal.title,
    content: [goal.objective, goal.progressSummary, ...(goal.nextActions || []), ...(goal.successCriteria || [])].join('\n'),
    concepts: [],
    files: [...(goal.evidenceRefs || []).map((ref) => ref?.path || ''), ...(goal.archiveRefs || []).map((ref) => ref?.path || '')],
    sourcePath: '',
    projectRoot,
  };
}

function projectMemorySummary(memory) {
  return {
    id: memory.id,
    title: memory.title,
    timestamp: memory.timestamp,
    type: memory.type,
    layer: memory.layer,
    importance: memory.importance,
    quality: memory.quality ? {
      overall: memory.quality.overall,
      recommendation: memory.quality.recommendation,
      reasons: memory.quality.reasons,
    } : null,
    primaryProject: memory.primaryDeploymentProject?.id || '',
    sourceKind: memory.sourceKind,
    sourcePath: memory.sourcePath,
    concepts: memory.concepts.slice(0, 8),
  };
}

function annotateCoveredMemories(memories) {
  const groups = new Map();
  for (const memory of memories) {
    const key = coverageKey(memory);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(memory);
  }
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    const sorted = [...items].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    const representative = sorted[0];
    for (const memory of sorted.slice(1)) {
      if (daysBetween(representative.timestamp, memory.timestamp) < 1) continue;
      memory.coveredBy = {
        id: representative.id,
        title: representative.title,
        timestamp: representative.timestamp,
        reason: 'same project/type/title cluster has a newer representative memory',
      };
    }
  }
}

function coverageKey(memory) {
  const topic = normalizeComparableText(memory.title)
    .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/gu, '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/gu, '')
    .slice(0, 180);
  if (!topic || topic.length < 12) return '';
  return [
    memory.project || '',
    memory.type || '',
    memory.layer || '',
    hashText(topic),
  ].join(':');
}

function findDuplicateGroups(memories) {
  const groups = new Map();
  for (const memory of memories) {
    const key = duplicateKey(memory);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(memory);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => memoryKeepScore(b) - memoryKeepScore(a));
      return {
        key,
        count: sorted.length,
        primaryId: sorted[0].id,
        primaryTitle: sorted[0].title,
        items: sorted.slice(0, 16).map((item) => ({
          id: item.id,
          title: item.title,
          timestamp: item.timestamp,
          type: item.type,
          sourcePath: item.sourcePath,
          keepScore: Number(memoryKeepScore(item).toFixed(2)),
        })),
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 240);
}

function duplicateKey(memory) {
  if (!memory.content && !memory.title) return '';
  if (/conversation_summary|archive-backed|conversation_archive/iu.test(`${memory.type} ${memory.title} ${memory.sourceKind}`) && memory.sourcePath) {
    return `archive:${memory.sourcePath}`;
  }
  return `${memory.type}:${memory.titleHash}:${memory.textHash}`;
}

function memoryKeepScore(memory) {
  return (IMPORTANCE_WEIGHT[memory.importance] || 0.5) * 10
    + memory.confidence * 5
    + sourceStrengthScore(memory) * 4
    + (memory.reusable ? 3 : 0)
    + (memory.needsVerification ? -2 : 0)
    + (memory.encodingWarning ? -4 : 0)
    + Math.max(0, 3 - daysSince(memory.timestamp) / 30);
}

function buildCleanupDryRun({ memories, rawMemoryCount, duplicateGroups, health, goals }) {
  const actions = [];
  for (const group of duplicateGroups.slice(0, 80)) {
    const demote = group.items.filter((item) => item.id !== group.primaryId).map((item) => item.id);
    if (demote.length) {
      actions.push({
        type: 'dedupe_demote',
        severity: 'medium',
        targetIds: demote,
        keepId: group.primaryId,
        reason: `Duplicate group has ${group.count} records; keep strongest source and demote the rest.`,
        destructive: false,
      });
    }
  }
  for (const item of health.encodingWarnings.slice(0, 80)) {
    actions.push({
      type: 'encoding_review',
      severity: item.severity,
      targetIds: [item.id],
      reason: `Encoding damage suspected in ${item.title}.`,
      destructive: false,
    });
  }
  for (const item of health.oversizedArchiveBacked.slice(0, 80)) {
    actions.push({
      type: 'oversized_archive_summary',
      severity: 'low',
      targetIds: [item.id],
      reason: 'Archive-backed memory is large; prefer a compact representative plus source archive link.',
      destructive: false,
    });
  }
  for (const memory of memories.filter((item) => item.coveredBy).slice(0, 80)) {
    actions.push({
      type: 'covered_memory_downrank',
      severity: 'low',
      targetIds: [memory.id],
      representativeId: memory.coveredBy.id,
      reason: `A newer representative memory covers this topic: ${memory.coveredBy.title}.`,
      destructive: false,
    });
  }
  for (const goal of goals.items.filter((item) => item.status === 'active' && item.missingCriteria.length)) {
    actions.push({
      type: 'goal_audit_followup',
      severity: 'high',
      goalId: goal.id,
      reason: `Active goal has missing completion criteria or open resume packets: ${goal.missingCriteria.slice(0, 4).join('; ')}`,
      destructive: false,
    });
  }
  return {
    summary: {
      rawMemories: rawMemoryCount,
      activeMemories: memories.length,
      coveredMemories: memories.filter((memory) => memory.coveredBy).length,
      suggestedActions: actions.length,
      destructiveActions: 0,
      note: 'Dry-run only. Use forget/tombstone or explicit user-approved cleanup for any future mutation.',
    },
    actions,
  };
}

function buildFacets(memories) {
  return {
    projects: topCounts(memories.map((item) => item.project).filter(Boolean), 60),
    concepts: topCounts(memories.flatMap((item) => item.concepts), 100),
    types: topCounts(memories.map((item) => item.type), 80),
    layers: topCounts(memories.map((item) => item.layer), 20),
    sources: topCounts(memories.map((item) => item.sourceKind), 80),
    importance: topCounts(memories.map((item) => item.importance), 20),
    deploymentProjects: topCounts(memories.flatMap((item) => (item.deploymentProjects || []).map((project) => project.name || project.id)), 40),
  };
}

function buildHealthRecommendations({ encodingWarnings, duplicateGroups, orphanResumePackets, staleGoals, oversizedArchiveBacked, coveredMemories, files }) {
  const out = [];
  if (encodingWarnings.length) out.push(`Review ${encodingWarnings.length} encoding warnings before trusting affected memories.`);
  if (duplicateGroups.length) out.push(`Demote or merge ${duplicateGroups.length} duplicate memory groups through non-destructive tombstones or future explicit cleanup.`);
  if (coveredMemories.length) out.push(`Downrank ${coveredMemories.length} older memories that appear covered by newer representative facts.`);
  if (orphanResumePackets.length) out.push(`Resolve or archive ${orphanResumePackets.length} orphan resume packets after confirming their goals no longer exist.`);
  if (staleGoals.length) out.push(`Checkpoint or block ${staleGoals.length} active goals that have not moved for more than 7 days.`);
  if (oversizedArchiveBacked.length) out.push(`Compact ${oversizedArchiveBacked.length} oversized archive-backed memories while preserving original archives.`);
  if (files.memoriesBytes > 50 * 1024 * 1024) out.push('memories.jsonl is large; prefer indexed recall and dedupe to keep prompt context small.');
  if (!out.length) out.push('AM health looks stable. Keep local no-port mode.');
  return out;
}

function limitIndex(index, options = {}) {
  const includeMemories = options.includeMemories !== false;
  const memoryLimit = clampInt(options.memoryLimit || options.limit, 1, 10000, 500);
  return {
    ...index,
    memories: includeMemories ? index.memories.slice(0, memoryLimit) : [],
  };
}

async function writeIndex(paths, index) {
  const memoriesForRecall = selectRecallIndexMemories(index.memories, 1000);
  const compact = {
    ...index,
    memories: memoriesForRecall.map((memory) => ({
      id: memory.id,
      kind: 'memory',
      timestamp: memory.timestamp,
      title: memory.title,
      type: memory.type,
      layer: memory.layer,
      importance: memory.importance,
      reusable: memory.reusable,
      needsVerification: memory.needsVerification,
      project: memory.project,
      sourceKind: memory.sourceKind,
      sourcePath: memory.sourcePath,
      concepts: memory.concepts,
      quality: memory.quality,
      coveredBy: memory.coveredBy,
      deploymentProjects: memory.deploymentProjects,
      primaryDeploymentProject: memory.primaryDeploymentProject,
      explicitDeploymentProjectIds: memory.explicitDeploymentProjectIds,
      metadata: compactCurrentFactMetadata(memory),
      summary: memory.summary || excerpt(memory.content, '', 320),
    })),
  };
  await writeJsonFile(path.join(paths.root, 'am-vnext-index.json'), compact);
  await writeJsonFile(path.join(paths.root, 'current_fact_index.json'), buildCurrentFactIndex(index.memories));
}

function compactCurrentFactMetadata(memory = {}) {
  const metadata = memory.metadata && typeof memory.metadata === 'object' ? memory.metadata : {};
  const out = {};
  const currentFor = firstString(metadata.currentFor, metadata.current_for, memory.currentFor, memory.current_for);
  const supersedes = unique([...splitList(metadata.supersedes), ...splitList(memory.supersedes)]);
  const supersededBy = unique([...splitList(metadata.supersededBy), ...splitList(memory.supersededBy)]);
  if (currentFor) out.currentFor = currentFor;
  if (supersedes.length) out.supersedes = supersedes;
  if (supersededBy.length) out.supersededBy = supersededBy;
  for (const key of ['validFrom', 'validTo', 'status']) {
    const value = metadata[key] ?? memory[key];
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

function selectRecallIndexMemories(memories = [], limit = 1000) {
  const sorted = [...memories].sort(compareRecallIndexRecency);
  const selected = [];
  const countsByType = new Map();
  for (const memory of sorted) {
    const type = String(memory.type || '');
    const cap = recallIndexTypeCap(type);
    const count = countsByType.get(type) || 0;
    if (count >= cap) continue;
    selected.push(memory);
    countsByType.set(type, count + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function compareRecallIndexRecency(a, b) {
  return String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
    || (b.quality?.overall || 0) - (a.quality?.overall || 0);
}

function recallIndexTypeCap(type) {
  const caps = {
    am_first_finish_summary: 80,
    am_first_stage_summary: 40,
    conversation_archive: 10,
    conversation_summary: 80,
    consolidated_memory: 120,
  };
  return Object.prototype.hasOwnProperty.call(caps, type) ? caps[type] : Number.POSITIVE_INFINITY;
}

async function fileSizes(paths) {
  return {
    memoriesBytes: await fileSize(paths.memories),
    eventsBytes: await fileSize(paths.events),
    sessionsBytes: await fileSize(paths.sessions),
    maintenanceBytes: await fileSize(paths.maintenance),
    goalsBytes: await fileSize(paths.goals),
    goalResumePacketsBytes: await fileSize(paths.goalResumePackets),
  };
}

async function fileSize(file) {
  try {
    return (await fsp.stat(file)).size;
  } catch {
    return 0;
  }
}

async function readJsonl(file) {
  const records = [];
  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        records.push({ kind: 'parse_error', raw: line.slice(0, 500) });
      }
    }
  } catch {
    return [];
  }
  return records;
}

async function writeJsonFile(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(sanitizeDerivedJson(value), null, 2), 'utf8');
}

function sanitizeDerivedJson(value, depth = 0) {
  if (depth > 20) return '[max-depth]';
  if (typeof value === 'string') {
    return hasEncodingDamage(value) ? `[encoding-damage omitted: ${encodingDamageStringSample(value)}]` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDerivedJson(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeDerivedJson(item, depth + 1)]));
  }
  return value;
}

function latestGoalSnapshots(records) {
  const latest = new Map();
  for (const goal of records.filter((record) => record?.kind === 'goal')) {
    const existing = latest.get(goal.id);
    if (!existing || String(goal.updatedAt || goal.createdAt || '').localeCompare(String(existing.updatedAt || existing.createdAt || '')) >= 0) {
      latest.set(goal.id, goal);
    }
  }
  return [...latest.values()];
}

function latestById(records) {
  const latest = new Map();
  for (const record of records) {
    const existing = latest.get(record.id);
    if (!existing || String(record.resolvedAt || record.updatedAt || record.timestamp || '').localeCompare(String(existing.resolvedAt || existing.updatedAt || existing.timestamp || '')) >= 0) {
      latest.set(record.id, record);
    }
  }
  return [...latest.values()].sort(descTime);
}

function groupBy(records, key) {
  const map = new Map();
  for (const record of records) {
    const value = record?.[key];
    if (!value) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(record);
  }
  return map;
}

function descTime(a, b) {
  return String(b.updatedAt || b.timestamp || b.createdAt || '').localeCompare(String(a.updatedAt || a.timestamp || a.createdAt || ''));
}

function sourceStrengthScore(memory) {
  const kind = String(memory.sourceKind || '').toLowerCase();
  if (kind.includes('conversation_archive')) return 0.95;
  if (kind.includes('local_reflection')) return 0.78;
  if (kind.includes('hook')) return 0.7;
  if (memory.sourcePath) return 0.68;
  return 0.38;
}

function qualityRecommendation(score, reasons) {
  if (reasons.includes('encoding_warning')) return 'review_encoding';
  if (reasons.includes('duplicate_non_primary')) return 'dedupe_demote';
  if (reasons.includes('covered_by_newer_memory')) return 'downrank';
  if (reasons.includes('needs_verification')) return 'verify_first';
  if (score < 55) return 'downrank';
  if (score > 82) return 'prefer';
  return 'keep';
}

function statusRank(status) {
  const text = String(status || '').toLowerCase();
  if (text === 'active') return 0;
  if (text === 'blocked') return 1;
  if (text === 'paused') return 2;
  if (text === 'completed') return 3;
  return 4;
}

function topCounts(values, limit) {
  const map = new Map();
  for (const value of values.map((item) => String(item || '').trim()).filter(Boolean)) {
    map.set(value, (map.get(value) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function hasEncodingDamage(value) {
  const text = String(value || '').replace(/\\\\\?\\/gu, '');
  return /\uFFFD|鑰|鎴|鐢|杩|涓|绛|妯|鍥|鑷||埗|Ã.|Â.|â€|è‡|åˆ|ä¸|æ–|æœ|çš|ç”|ç»|å¾|ä»|å·|ç¼|å¼|[A-Za-z]:[\\/]\?{2,}[\\/]|\/\?{2,}|(?:^|[^\p{L}\p{N}])\?{3,}(?:[^\p{L}\p{N}]|$)/iu.test(text);
}

function findEncodingDamage(value, pathParts = [], out = []) {
  if (out.length >= 20) return out;
  if (typeof value === 'string') {
    if (hasEncodingDamage(value)) {
      out.push({
        path: pathParts.join('.') || '$',
        sample: encodingDamageStringSample(value),
        severity: value.includes('\uFFFD') || /[A-Za-z]:[\\/]\?{2,}[\\/]|\\\?{2,}|\/\?{2,}|\?{3,}/u.test(value) ? 'high' : 'medium',
      });
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < Math.min(value.length, 40); index += 1) {
      findEncodingDamage(value[index], [...pathParts, String(index)], out);
      if (out.length >= 20) break;
    }
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      findEncodingDamage(item, [...pathParts, key], out);
      if (out.length >= 20) break;
    }
  }
  return out;
}

function encodingDamageSample(value) {
  const hit = findEncodingDamage(value)[0];
  return hit ? `${hit.path}: ${hit.sample}` : '';
}

function encodingDamageStringSample(value) {
  return excerpt(String(value || '').replace(/\s+/gu, ' ').split('').map((char) => {
    if (char === '?' || char.codePointAt(0) > 0x7E) {
      return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    }
    return char;
  }).join(''), '', 220);
}

function normalizeComparableText(value) {
  return String(value || '').toLowerCase().replace(/\s+/gu, ' ').trim().slice(0, 2400);
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_:/.-]+/gu, ' ')
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 80);
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || '').split(/[,;]\s*/u).map((item) => item.trim()).filter(Boolean);
}

function unique(items) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function daysSince(timestamp) {
  const value = Date.parse(timestamp || '');
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - value) / (24 * 60 * 60 * 1000));
}

function daysBetween(newer, older) {
  const newerTime = Date.parse(newer || '');
  const olderTime = Date.parse(older || '');
  if (!Number.isFinite(newerTime) || !Number.isFinite(olderTime)) return 0;
  return Math.max(0, (newerTime - olderTime) / (24 * 60 * 60 * 1000));
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/u).map((line) => line.trim()).find(Boolean) || '';
}

function excerpt(text, query, maxChars) {
  const source = String(text || '').replace(/\s+/gu, ' ').trim();
  if (!source) return '';
  const lower = source.toLowerCase();
  const terms = tokenize(query);
  const hits = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
  const center = hits.length ? Math.min(...hits) : 0;
  const start = Math.max(0, center - Math.floor(maxChars / 3));
  const value = source.slice(start, start + maxChars);
  return `${start > 0 ? '...' : ''}${value}${start + maxChars < source.length ? '...' : ''}`;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}
