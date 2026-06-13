import type {
  Command,
  CommandLogStreamEvent,
  GetCommandResponse,
  ListCommandLogsResponse,
} from "@crownest/contracts";

import {
  commandLogParams,
  CrowNestApiError,
  dispatchCommandLogEvent,
  hasCommandLogCallbacks,
  notifyCommandStreamError,
  queryString,
  type RunCommandOptions,
  runSandboxCommand,
  type Transport,
} from "./protocol";

export type CommandLogStreamOptions = {
  readonly afterSeq?: number;
  readonly reconnect?: boolean;
};

const terminalCommandStatuses = new Set<Command["status"]>([
  "exited",
  "failed",
  "canceled",
  "timed_out",
  "killed",
]);

const streamReconnectDelaysMs = [250, 500, 1_000, 2_000, 4_000] as const;
const defaultBlockingCommandTimeoutMs = 60_000;

export async function runCommandWithCallbacks(
  transport: Transport,
  sandboxId: `sbx_${string}`,
  command: string,
  mode: "run" | "start",
  input: RunCommandOptions,
): Promise<Command> {
  if (!hasCommandLogCallbacks(input)) {
    return runSandboxCommand(transport, sandboxId, command, mode, input);
  }

  if (mode === "run" && hasCommandCollection(input)) {
    const terminalCommand = await runSandboxCommand(
      transport,
      sandboxId,
      command,
      "run",
      withCallbackRunReadRequirement(mode, input),
    );
    await replayCommandLogs(transport, terminalCommand.id, input);
    return terminalCommand;
  }

  const startInput = withCallbackRunReadRequirement(
    mode,
    withCallbackRunTimeout(mode, input),
  );
  const commandResponse = await runSandboxCommand(
    transport,
    sandboxId,
    command,
    "start",
    startInput,
  );
  const pump = startCommandStreamPump(transport, commandResponse.id, input);

  if (mode === "start") {
    return commandResponse;
  }

  try {
    const terminalCommand = await pollCommandUntilTerminal(
      transport,
      commandResponse.id,
    );
    await pump.promise;
    return terminalCommand;
  } catch (error) {
    pump.stop();
    await pump.promise;
    throw error;
  }
}

type CallbackRunStartOptions = RunCommandOptions & {
  readonly _crownestRequireCommandRead?: true;
};

function withCallbackRunReadRequirement(
  mode: "run" | "start",
  input: RunCommandOptions,
): CallbackRunStartOptions {
  if (mode === "start") {
    return input;
  }
  return { ...input, _crownestRequireCommandRead: true };
}

function withCallbackRunTimeout(
  mode: "run" | "start",
  input: RunCommandOptions,
): RunCommandOptions {
  if (mode === "start" || input.timeoutMs !== undefined) {
    return input;
  }
  return { ...input, timeoutMs: defaultBlockingCommandTimeoutMs };
}

export async function* streamCommandLogs(
  transport: Transport,
  commandId: `cmd_${string}`,
  input: CommandLogStreamOptions = {},
): AsyncIterable<CommandLogStreamEvent> {
  if (input.reconnect === false) {
    yield* streamCommandLogsOnce(transport, commandId, input.afterSeq);
    return;
  }

  let afterSeq = input.afterSeq;
  let retryIndex = 0;
  let originalError: unknown;

  for (;;) {
    let madeLogProgress = false;
    try {
      for await (const event of streamCommandLogsOnce(transport, commandId, afterSeq)) {
        if (event.type === "log") {
          madeLogProgress = commandLogMadeProgress(event.seq, afterSeq);
          afterSeq = event.seq;
        }
        yield event;
        if (isTerminalStreamEvent(event)) {
          return;
        }
      }
      originalError ??= new Error("Command log stream ended before a terminal event.");
    } catch (error) {
      throwIfStructuredApiError(error);
      originalError ??= error;
    }

    if (madeLogProgress) {
      retryIndex = 0;
    }
    if (retryIndex >= streamReconnectDelaysMs.length) {
      throw originalError;
    }
    await delay(reconnectDelayMs(retryIndex));
    retryIndex += 1;
  }
}

function throwIfStructuredApiError(error: unknown): void {
  if (error instanceof CrowNestApiError) {
    throw error;
  }
}

function commandLogMadeProgress(seq: number, afterSeq: number | undefined): boolean {
  return afterSeq === undefined || seq > afterSeq;
}

function reconnectDelayMs(retryIndex: number): number {
  return streamReconnectDelaysMs[retryIndex] ?? 4_000;
}

function isTerminalStreamEvent(event: CommandLogStreamEvent): boolean {
  return event.type === "terminal" || event.type === "error";
}

function streamCommandLogsOnce(
  transport: Transport,
  commandId: `cmd_${string}`,
  afterSeq: number | undefined,
): AsyncIterable<CommandLogStreamEvent> {
  return transport.streamSse<CommandLogStreamEvent>(
    `/v1/commands/${commandId}/stream${queryString(
      commandLogParams(afterSeq === undefined ? {} : { afterSeq }),
    )}`,
  );
}

function hasCommandCollection(input: RunCommandOptions): boolean {
  return input.collect !== undefined || input.collectOn !== undefined;
}

function startCommandStreamPump(
  transport: Transport,
  commandId: `cmd_${string}`,
  callbacks: Pick<RunCommandOptions, "onStderr" | "onStdout" | "onStreamError">,
): { readonly promise: Promise<void>; readonly stop: () => void } {
  const state = { stopped: false };
  const iterator = streamCommandLogs(transport, commandId)[Symbol.asyncIterator]();
  const promise = (async () => {
    try {
      for (;;) {
        const event = await iterator.next();
        if (event.done || state.stopped) {
          return;
        }
        if (dispatchCommandLogEvent(event.value, callbacks)) {
          return;
        }
      }
    } catch (error) {
      if (!state.stopped) {
        notifyCommandStreamError(error, callbacks);
      }
    } finally {
      await iterator.return?.();
    }
  })();

  return {
    promise,
    stop() {
      state.stopped = true;
      void iterator.return?.().catch(() => undefined);
    },
  };
}

async function replayCommandLogs(
  transport: Transport,
  commandId: `cmd_${string}`,
  callbacks: Pick<RunCommandOptions, "onStderr" | "onStdout" | "onStreamError">,
): Promise<void> {
  let afterSeq: number | undefined;
  try {
    for (;;) {
      const response = await transport.request<ListCommandLogsResponse>(
        `/v1/commands/${commandId}/logs${queryString(
          commandLogParams(afterSeq === undefined ? {} : { afterSeq }),
        )}`,
        { method: "GET" },
      );
      for (const chunk of response.data) {
        if (
          dispatchCommandLogEvent(
            {
              createdAt: chunk.createdAt,
              data: chunk.data,
              seq: chunk.seq,
              stream: chunk.stream,
              type: "log",
            },
            callbacks,
          )
        ) {
          return;
        }
        afterSeq = chunk.seq;
      }
      if (!response.hasMore || response.data.length === 0) {
        return;
      }
    }
  } catch (error) {
    notifyCommandStreamError(error, callbacks);
  }
}

async function pollCommandUntilTerminal(
  transport: Transport,
  commandId: `cmd_${string}`,
): Promise<Command> {
  for (;;) {
    const response = await transport.request<GetCommandResponse>(
      `/v1/commands/${commandId}`,
      { method: "GET" },
    );
    if (terminalCommandStatuses.has(response.command.status)) {
      return response.command;
    }
    await delay(500);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
