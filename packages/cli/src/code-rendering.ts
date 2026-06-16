type WritableStream = {
  write(chunk: string): void;
};

export type CodeExecutionError = {
  readonly message: string;
  readonly name?: string;
  readonly traceback?: readonly string[];
};

type CodeOutput = {
  readonly artifactId?: string;
  readonly contentType?: string;
  readonly format: string;
  readonly kind: string;
  readonly reason?: string;
  readonly sizeBytes?: number;
  readonly value?: unknown;
};

export function renderCodeOutput(output: CodeOutput): string {
  if (output.kind === "artifact") {
    return `[artifact ${output.artifactId} ${output.contentType} ${output.sizeBytes}B]\n`;
  }
  if (output.kind === "rejected") {
    return `[rejected ${output.format} ${output.reason}]\n`;
  }
  if (typeof output.value === "string") {
    return `${output.value}\n`;
  }
  return `${JSON.stringify(output.value)}\n`;
}

export function renderExecutionError(error: CodeExecutionError): string {
  return [
    `${error.name ?? "Error"}: ${error.message}`,
    ...(error.traceback ?? []),
    "",
  ].join("\n");
}

export function writeChunk(stream: WritableStream | undefined, chunk: string) {
  if (stream) {
    stream.write(chunk);
    return "";
  }
  return chunk;
}

export function writeCodeChunks(
  stream: WritableStream | undefined,
  chunks: readonly string[],
) {
  return chunks.reduce((rendered, chunk) => rendered + writeChunk(stream, chunk), "");
}

export function writeCodeOutputs(
  stream: WritableStream | undefined,
  outputs: readonly CodeOutput[],
) {
  return outputs.reduce(
    (rendered, codeOutput) =>
      rendered + writeChunk(stream, renderCodeOutput(codeOutput)),
    "",
  );
}
