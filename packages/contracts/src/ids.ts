export const ResourceIdPrefix = {
  ApiKey: "key",
  Artifact: "art",
  Backup: "bkp",
  CodeContext: "cctx",
  Command: "cmd",
  Organization: "org",
  Preview: "prv",
  Project: "prj",
  Sandbox: "sbx",
  Template: "tpl",
  TemplateVersion: "tplv",
  Upload: "upl",
  User: "usr",
} as const;

export type ResourceIdPrefix = (typeof ResourceIdPrefix)[keyof typeof ResourceIdPrefix];

export type ResourceId = `${ResourceIdPrefix}_${string}`;

export function isResourceId(value: string): value is ResourceId {
  const [prefix, suffix] = value.split("_");

  if (prefix === undefined || suffix === undefined || suffix.length === 0) {
    return false;
  }

  return Object.values(ResourceIdPrefix).includes(prefix as ResourceIdPrefix);
}
