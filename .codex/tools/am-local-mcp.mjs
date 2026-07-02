#!/usr/bin/env node
import {
  consolidate,
  diagnose,
  forget,
  goalBlock,
  goalCheckpoint,
  goalCompletionAudit,
  goalComplete,
  goalHeartbeat,
  goalList,
  goalParticipantRegister,
  goalParticipantRelease,
  goalResumePacket,
  goalResumePacketResolve,
  goalResumePackets,
  goalStart,
  goalStageReview,
  goalStatus,
  goalWatchdogCheck,
  memoryCleanupDryRun,
  memoryGoalBoard,
  memoryHealth,
  memoryIndex,
  memoryProjectBoard,
  observe,
  recall,
  reflect,
  remember,
  resumeAutomationRequestList,
  resumeAutomationRequestMarkWake,
  resumeAutomationRequestResolve,
  resumeAutomationRequestRetryDue,
  resolveProjectRoot,
  sessionEvent,
  sessionHistory,
  summarizeLatestArchive,
  turnWatchStart,
  turnWatchStatus,
  turnWatchStop,
} from './am-local-store.mjs';

const projectRoot = resolveProjectRoot(process.env.AGENTMEMORY_PROJECT_ROOT || process.cwd());

const toolSchemas = [
  {
    name: 'remember',
    description: 'Save a durable local AM memory with source, layer, importance, and concepts. No network or ports.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        title: { type: 'string' },
        type: { type: 'string' },
        layer: { type: 'string' },
        importance: { type: 'string' },
        concepts: { type: 'array', items: { type: 'string' } },
        files: { type: 'array', items: { type: 'string' } },
        source: { type: 'object' },
      },
      required: ['content'],
      additionalProperties: true,
    },
  },
  {
    name: 'memory_recall',
    description: 'Recall relevant local AM memories, summaries, project facts, and reusable lessons.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
        project: { type: 'string' },
        deploymentProject: { type: 'string' },
        projectId: { type: 'string' },
        projectBucket: { type: 'string' },
        concept: { type: 'string' },
        concepts: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        file: { type: 'string' },
        path: { type: 'string' },
        enhanced: { type: 'boolean' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'search',
    description: 'Alias of memory_recall for local AM compatibility.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
        project: { type: 'string' },
        deploymentProject: { type: 'string' },
        projectId: { type: 'string' },
        projectBucket: { type: 'string' },
        concept: { type: 'string' },
        concepts: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        file: { type: 'string' },
        path: { type: 'string' },
        enhanced: { type: 'boolean' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'session_history',
    description: 'Return recent local conversation archives and session lifecycle records.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'memory_diagnose',
    description: 'Diagnose local AM store counts, archive visibility, encoding warnings, and no-port status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'memory_index',
    description: 'Build the AM vNext local index with facets, quality scores, duplicate groups, health, and cleanup suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        includeMemories: { type: 'boolean' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'memory_health',
    description: 'Return AM vNext health report: file sizes, duplicate groups, encoding warnings, stale goals, and orphan resume packets.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'memory_cleanup_dry_run',
    description: 'Suggest AM cleanup, dedupe, downrank, and encoding actions without modifying any memory data.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'memory_goal_board',
    description: 'Return AM vNext goal board with active/blocked/completed goals, checkpoints, resume packets, and completion audit state.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'memory_project_board',
    description: 'Return AM vNext project board grouping memories by deployed local projects and tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: true },
  },
  {
    name: 'memory_consolidate',
    description: 'Extract durable project/user memories from recent conversation archives.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        tier: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'memory_reflect',
    description: 'Create reusable workflow lessons from recent archives and AM observations.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        maxClusters: { type: 'number' },
        project: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'forget',
    description: 'Create a non-destructive local AM tombstone for a memory id or query.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        query: { type: 'string' },
        reason: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'goal_start',
    description: 'Start a local AM goal. Pauses any existing active project goal. No network or ports.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        objective: { type: 'string' },
        successCriteria: { type: 'array', items: { type: 'string' } },
        nextActions: { type: 'array', items: { type: 'string' } },
        evidenceRefs: { type: 'array', items: { type: 'object' } },
        archiveRefs: { type: 'array', items: { type: 'object' } },
      },
      required: ['objective'],
      additionalProperties: true,
    },
  },
  {
    name: 'goal_status',
    description: 'Return the active local AM goal, recent goals, and recent goal events.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        goalId: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'goal_checkpoint',
    description: 'Append progress to the active local AM goal with evidence and next actions.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        summary: { type: 'string' },
        progressSummary: { type: 'string' },
        nextActions: { type: 'array', items: { type: 'string' } },
        evidenceRefs: { type: 'array', items: { type: 'object' } },
        archiveRefs: { type: 'array', items: { type: 'object' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_complete',
    description: 'Complete an AM goal only after verification evidence exists; writes a completion packet and durable memory.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        verificationSummary: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'object' } },
        archiveRefs: { type: 'array', items: { type: 'object' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_block',
    description: 'Record a goal blocker. The goal is marked blocked only after the same blocker is recorded three times.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        blocker: { type: 'string' },
        reason: { type: 'string' },
        nextActions: { type: 'array', items: { type: 'string' } },
        evidenceRefs: { type: 'array', items: { type: 'object' } },
        archiveRefs: { type: 'array', items: { type: 'object' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_list',
    description: 'List local AM goals by latest snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'goal_participant_register',
    description: 'Register a participant that must prove work for an AM goal with local heartbeats.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        participantId: { type: 'string' },
        kind: { type: 'string' },
        pid: { type: 'number' },
        taskId: { type: 'string' },
        expectedHeartbeatSeconds: { type: 'number' },
        lastProof: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_heartbeat',
    description: 'Append a local participant heartbeat/work proof for an AM goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        participantId: { type: 'string' },
        kind: { type: 'string' },
        pid: { type: 'number' },
        taskId: { type: 'string' },
        expectedHeartbeatSeconds: { type: 'number' },
        status: { type: 'string' },
        lastProof: { type: 'string' },
        claimsComplete: { type: 'boolean' },
        evidenceRefs: { type: 'array', items: { type: 'object' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_participant_release',
    description: 'Release a goal participant after normal completion so future turns do not treat it as interrupted.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        participantId: { type: 'string' },
        taskId: { type: 'string' },
        lastProof: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_watchdog_check',
    description: 'Check AM goal participants for stale work and create a resume packet when work must continue.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        auditCompletion: { type: 'boolean' },
        summary: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'object' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_stage_review',
    description: 'Record a stage review for an AM goal and save reusable lessons when appropriate.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        summary: { type: 'string' },
        nextActions: { type: 'array', items: { type: 'string' } },
        lessons: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_completion_audit',
    description: 'Audit every success criterion before goal_complete is allowed.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        verificationSummary: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'object' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_resume_packet',
    description: 'Create a local resume packet that tells the next turn exactly how to continue an AM goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        reason: { type: 'string' },
        missing: { type: 'array', items: { type: 'string' } },
        nextActions: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_resume_packets',
    description: 'List local AM goal resume packets, usually unresolved open packets for the next turn.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'goal_resume_packet_resolve',
    description: 'Resolve open AM goal resume packets after the participant recovers or the missing evidence is handled.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        resumePacketId: { type: 'string' },
        incidentKey: { type: 'string' },
        participantId: { type: 'string' },
        taskId: { type: 'string' },
        reason: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'turn_watch_start',
    description: 'Start a local no-port watcher for the current turn so AM can detect interruption.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        sessionId: { type: 'string' },
        threadId: { type: 'string' },
        turnId: { type: 'string' },
        transcriptPath: { type: 'string' },
        expectedHeartbeatSeconds: { type: 'number' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'turn_watch_status',
    description: 'List local AM turn watchers and their interruption/release status.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        turnId: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'turn_watch_stop',
    description: 'Stop/release a local AM turn watcher after a normal Stop hook.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        turnId: { type: 'string' },
        sessionId: { type: 'string' },
        participantId: { type: 'string' },
        status: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'resume_automation_request_list',
    description: 'List one-shot app automation bridge requests created by AM turn watchdog.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'resume_automation_request_resolve',
    description: 'Resolve a one-shot app automation bridge request after it is handled or unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        requestId: { type: 'string' },
        resumePacketId: { type: 'string' },
        incidentKey: { type: 'string' },
        status: { type: 'string' },
        bridgeStatus: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'resume_automation_request_mark_wake',
    description: 'Mark an AM one-shot resume automation request as created/woken by the app bridge.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
        requestId: { type: 'string' },
        resumePacketId: { type: 'string' },
        automationId: { type: 'string' },
        status: { type: 'string' },
        bridgeStatus: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'resume_automation_request_retry_due',
    description: 'Create retry attempts for AM resume automation requests whose wake was not confirmed after the retry interval.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
];

let inputBuffer = Buffer.alloc(0);
let processing = Promise.resolve();

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processing = processing.then(() => processBufferedInput()).catch((error) => {
    writeLog(`am-local input error: ${error.message}`);
  });
});

process.stdin.on('end', () => {
  processing
    .then(() => processBufferedInput())
    .then(() => process.exit(0))
    .catch((error) => {
      writeLog(`am-local shutdown error: ${error.message}`);
      process.exit(1);
    });
});

async function processBufferedInput() {
  while (inputBuffer.length > 0) {
    const text = inputBuffer.toString('utf8');
    const headerEnd = text.indexOf('\r\n\r\n');
    if (headerEnd >= 0) {
      const header = text.slice(0, headerEnd);
      const match = header.match(/content-length:\s*(\d+)/iu);
      if (!match) {
        inputBuffer = inputBuffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number.parseInt(match[1], 10);
      const bodyStart = Buffer.byteLength(text.slice(0, headerEnd + 4), 'utf8');
      if (inputBuffer.length < bodyStart + length) {
        return;
      }
      const body = inputBuffer.slice(bodyStart, bodyStart + length).toString('utf8');
      inputBuffer = inputBuffer.slice(bodyStart + length);
      await handleMessage(JSON.parse(body));
      continue;
    }

    const newline = text.indexOf('\n');
    if (newline < 0) {
      return;
    }
    const line = text.slice(0, newline).trim();
    inputBuffer = inputBuffer.slice(Buffer.byteLength(text.slice(0, newline + 1), 'utf8'));
    if (line) {
      await handleMessage(JSON.parse(line));
    }
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.id === undefined || message.method === 'notifications/initialized') {
    return;
  }
  try {
    if (message.method === 'initialize') {
      sendResult(message.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'agentmemory-local-am', version: '1.0.0' },
      });
      return;
    }
    if (message.method === 'tools/list') {
      sendResult(message.id, { tools: toolSchemas });
      return;
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      const toolArgs = message.params?.arguments || {};
      const result = await callTool(name, toolArgs);
      sendResult(message.id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      });
      return;
    }
    sendError(message.id, -32601, `Unknown method: ${message.method}`);
  } catch (error) {
    sendError(message.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(name, args) {
  switch (name) {
    case 'remember':
      return remember(projectRoot, args);
    case 'memory_recall':
    case 'search':
      return recall(projectRoot, args);
    case 'session_history':
      return sessionHistory(projectRoot, args);
    case 'memory_diagnose':
      return diagnose(projectRoot);
    case 'memory_index':
      return memoryIndex(projectRoot, args);
    case 'memory_health':
      return memoryHealth(projectRoot, args);
    case 'memory_cleanup_dry_run':
      return memoryCleanupDryRun(projectRoot, args);
    case 'memory_goal_board':
      return memoryGoalBoard(projectRoot, args);
    case 'memory_project_board':
      return memoryProjectBoard(projectRoot, args);
    case 'memory_consolidate':
      return consolidate(projectRoot, args);
    case 'memory_reflect':
      return reflect(projectRoot, args);
    case 'forget':
      return forget(projectRoot, args);
    case 'goal_start':
      return goalStart(projectRoot, args);
    case 'goal_status':
      return goalStatus(projectRoot, args);
    case 'goal_checkpoint':
      return goalCheckpoint(projectRoot, args);
    case 'goal_complete':
      return goalComplete(projectRoot, args);
    case 'goal_block':
      return goalBlock(projectRoot, args);
    case 'goal_list':
      return goalList(projectRoot, args);
    case 'goal_participant_register':
      return goalParticipantRegister(projectRoot, args);
    case 'goal_heartbeat':
      return goalHeartbeat(projectRoot, args);
    case 'goal_participant_release':
      return goalParticipantRelease(projectRoot, args);
    case 'goal_watchdog_check':
      return goalWatchdogCheck(projectRoot, args);
    case 'goal_stage_review':
      return goalStageReview(projectRoot, args);
    case 'goal_completion_audit':
      return goalCompletionAudit(projectRoot, args);
    case 'goal_resume_packet':
      return goalResumePacket(projectRoot, args);
    case 'goal_resume_packets':
      return goalResumePackets(projectRoot, args);
    case 'goal_resume_packet_resolve':
      return goalResumePacketResolve(projectRoot, args);
    case 'turn_watch_start':
      return turnWatchStart(projectRoot, args);
    case 'turn_watch_status':
      return turnWatchStatus(projectRoot, args);
    case 'turn_watch_stop':
      return turnWatchStop(projectRoot, args);
    case 'resume_automation_request_list':
      return resumeAutomationRequestList(projectRoot, args);
    case 'resume_automation_request_resolve':
      return resumeAutomationRequestResolve(projectRoot, args);
    case 'resume_automation_request_mark_wake':
      return resumeAutomationRequestMarkWake(projectRoot, args);
    case 'resume_automation_request_retry_due':
      return resumeAutomationRequestRetryDue(projectRoot, args);
    case 'observe':
      return observe(projectRoot, args);
    case 'session_start':
      return sessionEvent(projectRoot, 'start', args);
    case 'session_end':
      return sessionEvent(projectRoot, 'end', args);
    case 'summarize_latest':
      return summarizeLatestArchive(projectRoot, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function send(payload) {
  const body = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function writeLog(message) {
  try {
    process.stderr.write(`${message}\n`);
  } catch {
  }
}
