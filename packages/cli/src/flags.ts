export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type FlagKind = "boolean" | "string" | "string[]";
export type FlagSpec = Readonly<Record<string, FlagKind>>;
export type ParsedFlags = {
  readonly flags: Record<string, string | boolean | readonly string[]>;
  readonly positionals: readonly string[];
};

type MutableFlags = Record<string, string | boolean | readonly string[]>;
type ParsedFlagToken = {
  readonly flag: string;
  readonly inlineValue?: string;
  readonly kind: FlagKind;
};

export function parseFlags(args: readonly string[], spec: FlagSpec): ParsedFlags {
  const flags: MutableFlags = {};
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;

    if (token === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }

    if (!isFlagToken(token)) {
      positionals.push(token);
      continue;
    }

    const parsed = parseFlagToken(token, spec);
    if (parsed.inlineValue !== undefined) {
      assignStringFlag(flags, parsed.flag, parsed.kind, parsed.inlineValue);
      continue;
    }

    if (parsed.kind === "boolean") {
      flags[parsed.flag] = true;
      continue;
    }

    assignStringFlag(
      flags,
      parsed.flag,
      parsed.kind,
      requiredFlagValue(args[index + 1], parsed.flag, spec),
    );
    index += 1;
  }

  return { flags, positionals };
}

export function booleanFlag(flags: ParsedFlags["flags"], flag: string): boolean {
  return flags[flag] === true;
}

export function stringFlag(
  flags: ParsedFlags["flags"],
  flag: string,
): string | undefined {
  const value = flags[flag];
  return typeof value === "string" ? value : undefined;
}

export function stringArrayFlag(
  flags: ParsedFlags["flags"],
  flag: string,
): readonly string[] {
  return stringArrayValue(flags[flag]);
}

export function requiredArg(value: string | undefined, label: string): string {
  if (!value) {
    throw new UsageError(`${label} is required.`);
  }

  return value;
}

export function requiredPrefixedArg(
  value: string | undefined,
  label: string,
  prefix: string,
): string {
  const parsed = requiredArg(value, label);
  if (!parsed.startsWith(prefix)) {
    throw new UsageError(`${label} must start with ${prefix}.`);
  }

  return parsed;
}

export function rejectExtraPositionals(
  positionals: readonly string[],
  command: string,
): void {
  if (positionals.length > 0) {
    throw new UsageError(
      `unexpected argument for ${command}: ${positionals.join(" ")}`,
    );
  }
}

export const jsonFlagSpec = { "--json": "boolean" } as const;

function isFlagToken(token: string): boolean {
  return token.startsWith("-") && token !== "-";
}

function validFlags(spec: FlagSpec): string {
  const flags = Object.keys(spec);
  return flags.length === 0 ? "none" : flags.join(", ");
}

function parseFlagToken(token: string, spec: FlagSpec): ParsedFlagToken {
  const inline = inlineLongFlagValue(token);
  const flag = inline?.flag ?? token;
  const kind = spec[flag];
  if (kind === undefined) {
    throw new UsageError(`unknown flag: ${flag} (valid: ${validFlags(spec)})`);
  }

  return {
    flag,
    ...(inline === undefined ? {} : { inlineValue: inline.value }),
    kind,
  };
}

function assignStringFlag(
  flags: MutableFlags,
  flag: string,
  kind: FlagKind,
  value: string,
): void {
  if (kind === "boolean") {
    throw new UsageError(`${flag} does not take a value.`);
  }

  if (kind === "string[]") {
    flags[flag] = [...stringArrayValue(flags[flag]), value];
  } else {
    flags[flag] = value;
  }
}

function requiredFlagValue(
  value: string | undefined,
  flag: string,
  spec: FlagSpec,
): string {
  if (value === undefined || value === "--" || Object.hasOwn(spec, value)) {
    throw new UsageError(`${flag} requires a value.`);
  }
  if (value.startsWith("--")) {
    throw new UsageError(`unknown flag: ${value} (valid: ${validFlags(spec)})`);
  }

  return value;
}

function inlineLongFlagValue(
  token: string,
): { readonly flag: string; readonly value: string } | undefined {
  if (!token.startsWith("--")) {
    return undefined;
  }

  const separator = token.indexOf("=");
  if (separator <= 2) {
    return undefined;
  }

  return {
    flag: token.slice(0, separator),
    value: token.slice(separator + 1),
  };
}

function stringArrayValue(
  value: string | boolean | readonly string[] | undefined,
): readonly string[] {
  return Array.isArray(value) ? (value as readonly string[]) : [];
}
