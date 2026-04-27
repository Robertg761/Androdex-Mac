#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const IGNORE_SEGMENTS = new Set(["node_modules", "dist", "dist-electron", ".turbo"]);
const GENERATED_SUFFIXES = [".gen.ts", "routeTree.gen.ts"];
const LEGACY_FILE_SIZE_EXEMPTIONS = new Set([
  "apps/web/src/composerDraftStore.test.ts",
  "apps/web/src/composerDraftStore.ts",
  "apps/web/src/session-logic.test.ts",
  "apps/web/src/session-logic.ts",
  "apps/web/src/store.test.ts",
  "apps/web/src/store/threadProjection.ts",
  "apps/web/src/terminalStateStore.ts",
  "apps/web/src/rpc/wsTransport.test.ts",
  "apps/web/src/environments/runtime/service.ts",
  "apps/web/src/components/ChatView.tsx",
  "apps/web/src/components/ComposerPromptEditor.tsx",
  "apps/web/src/components/GitActionsControl.logic.test.ts",
  "apps/web/src/components/GitActionsControl.tsx",
  "apps/web/src/components/Sidebar.logic.test.ts",
  "apps/web/src/components/Sidebar.tsx",
  "apps/web/src/components/ThreadTerminalDrawer.tsx",
  "apps/web/src/components/ui/sidebar.tsx",
  "apps/web/src/components/settings/ConnectionsSettings.tsx",
  "apps/web/src/components/settings/SettingsPanels.tsx",
  "apps/web/src/components/chat/ChatComposer.tsx",
  "apps/web/src/components/chat/MessagesTimeline.tsx",
  "apps/web/src/components/ChatView.logic.test.ts",
  "apps/web/src/components/CommandPalette.tsx",
  "apps/web/src/components/ui/toast.tsx",
  "apps/web/src/keybindings.test.ts",
  "apps/web/src/localApi.test.ts",
  "apps/server/src/cli.ts",
  "apps/server/src/codexAppServerManager.test.ts",
  "apps/server/src/keybindings.ts",
  "apps/server/src/server.test.ts",
  "apps/server/src/ws.ts",
  "apps/server/src/terminal/Layers/Manager.test.ts",
  "apps/server/src/terminal/Layers/Manager.ts",
  "apps/server/src/provider/codex/manager.ts",
  "apps/server/src/provider/Layers/ClaudeAdapter.test.ts",
  "apps/server/src/provider/Layers/ClaudeAdapter.ts",
  "apps/server/src/provider/Layers/ClaudeProvider.ts",
  "apps/server/src/provider/Layers/CodexAdapter.test.ts",
  "apps/server/src/provider/Layers/CodexAdapter.ts",
  "apps/server/src/provider/Layers/CodexSessionRuntime.ts",
  "apps/server/src/provider/Layers/CursorAdapter.test.ts",
  "apps/server/src/provider/Layers/CursorAdapter.ts",
  "apps/server/src/provider/Layers/CursorProvider.ts",
  "apps/server/src/provider/Layers/OpenCodeAdapter.ts",
  "apps/server/src/provider/Layers/ProviderRegistry.test.ts",
  "apps/server/src/provider/Layers/ProviderService.test.ts",
  "apps/server/src/provider/Layers/ProviderService.ts",
  "apps/server/src/orchestration/projector.test.ts",
  "apps/server/src/orchestration/Layers/CheckpointReactor.test.ts",
  "apps/server/src/orchestration/Layers/CheckpointReactor.ts",
  "apps/server/src/orchestration/Layers/OrchestrationEngine.test.ts",
  "apps/server/src/orchestration/Layers/ProjectionPipeline.test.ts",
  "apps/server/src/orchestration/Layers/ProjectionPipeline.ts",
  "apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.test.ts",
  "apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts",
  "apps/server/src/orchestration/Layers/ProviderCommandReactor.test.ts",
  "apps/server/src/orchestration/Layers/ProviderCommandReactor.ts",
  "apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts",
  "apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts",
  "apps/server/src/provider/acp/AcpSessionRuntime.ts",
  "apps/server/src/orchestration/decider.ts",
  "apps/server/src/git/Layers/GitCore.test.ts",
  "apps/server/src/git/Layers/GitCore.ts",
  "apps/server/src/git/Layers/GitManager.test.ts",
  "apps/server/src/git/Layers/GitManager.ts",
  "apps/server/src/codexAccounts/Layers/CodexAccountManager.ts",
  "apps/server/integration/orchestrationEngine.integration.test.ts",
  "apps/desktop/src/main.ts",
  "packages/shared/src/qrCode.ts",
  "packages/contracts/src/orchestration.ts",
  "packages/contracts/src/providerRuntime.ts",
  "packages/effect-codex-app-server/scripts/generate.ts",
  "scripts/build-desktop-artifact.ts",
]);

interface Violation {
  readonly file: string;
  readonly importPath: string;
  readonly message: string;
}

function walkFiles(root: string): string[] {
  const output: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_SEGMENTS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      const extension = path.extname(entry.name);
      if (!SOURCE_EXTENSIONS.has(extension)) {
        continue;
      }
      if (GENERATED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
        continue;
      }
      output.push(fullPath);
    }
  }

  return output;
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function relativeToRepo(filePath: string): string {
  return toPosix(path.relative(REPO_ROOT, filePath));
}

function classifyFile(
  filePath: string,
): "contracts" | "shared" | "client-runtime" | "server" | "web" | "desktop" | "other" {
  const relativePath = relativeToRepo(filePath);
  if (relativePath.startsWith("packages/contracts/")) return "contracts";
  if (relativePath.startsWith("packages/shared/")) return "shared";
  if (relativePath.startsWith("packages/client-runtime/")) return "client-runtime";
  if (relativePath.startsWith("apps/server/")) return "server";
  if (relativePath.startsWith("apps/web/")) return "web";
  if (relativePath.startsWith("apps/desktop/")) return "desktop";
  return "other";
}

function parseImportPaths(sourceText: string): string[] {
  const matches = new Set<string>();
  const importRegex =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

  let match: RegExpExecArray | null = importRegex.exec(sourceText);
  while (match) {
    const specifier = match[1] ?? match[2];
    if (specifier) {
      matches.add(specifier);
    }
    match = importRegex.exec(sourceText);
  }

  return Array.from(matches);
}

function resolveRelativeImport(fromFile: string, importPath: string): string | null {
  if (!importPath.startsWith(".")) {
    return null;
  }

  const basePath = path.resolve(path.dirname(fromFile), importPath);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mts`,
    `${basePath}.cts`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.mts"),
    path.join(basePath, "index.cts"),
  ];

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function checkPackageBoundaries(filePath: string, importPath: string): string | null {
  const scope = classifyFile(filePath);
  const resolvedRelative = resolveRelativeImport(filePath, importPath);
  const resolvedRelativePath = resolvedRelative ? relativeToRepo(resolvedRelative) : null;

  switch (scope) {
    case "contracts":
      if (
        importPath.startsWith("@t3tools/shared") ||
        importPath.startsWith("@t3tools/client-runtime") ||
        importPath.startsWith("@t3tools/web") ||
        importPath.startsWith("@t3tools/desktop") ||
        importPath === "androdex"
      ) {
        return "`packages/contracts` must stay schema-only and cannot depend on runtime packages.";
      }
      if (resolvedRelativePath && !resolvedRelativePath.startsWith("packages/contracts/")) {
        return "`packages/contracts` cannot reach outside its own package with relative imports.";
      }
      return null;
    case "shared":
      if (
        importPath.startsWith("@t3tools/web") ||
        importPath.startsWith("@t3tools/desktop") ||
        importPath === "androdex"
      ) {
        return "`packages/shared` cannot import from apps.";
      }
      if (
        resolvedRelativePath &&
        (resolvedRelativePath.startsWith("apps/") ||
          resolvedRelativePath.startsWith("packages/client-runtime/"))
      ) {
        return "`packages/shared` cannot reach app code through relative imports.";
      }
      return null;
    case "client-runtime":
      if (
        importPath.startsWith("@t3tools/shared") ||
        importPath.startsWith("@t3tools/web") ||
        importPath.startsWith("@t3tools/desktop") ||
        importPath === "androdex"
      ) {
        return "`packages/client-runtime` should only depend on contracts and itself.";
      }
      if (resolvedRelativePath && !resolvedRelativePath.startsWith("packages/client-runtime/")) {
        return "`packages/client-runtime` cannot reach outside its own package with relative imports.";
      }
      return null;
    case "web":
      if (importPath.startsWith("@t3tools/desktop")) {
        return "`apps/web` cannot import runtime logic from `apps/desktop`.";
      }
      if (resolvedRelativePath && resolvedRelativePath.startsWith("apps/desktop/")) {
        return "`apps/web` cannot reach desktop code through relative imports.";
      }
      return null;
    case "desktop":
      if (importPath.startsWith("@t3tools/web")) {
        return "`apps/desktop` cannot import runtime logic from `apps/web`.";
      }
      if (resolvedRelativePath && resolvedRelativePath.startsWith("apps/web/")) {
        return "`apps/desktop` cannot reach web code through relative imports.";
      }
      return null;
    case "server":
      if (importPath.startsWith("@t3tools/web")) {
        return "`apps/server` cannot import runtime logic from `apps/web`.";
      }
      if (resolvedRelativePath && resolvedRelativePath.startsWith("apps/web/")) {
        return "`apps/server` cannot reach web code through relative imports.";
      }
      return null;
    default:
      return null;
  }
}

function checkWebStoreImports(filePath: string, importPath: string): string | null {
  const relativePath = relativeToRepo(filePath);
  if (
    !relativePath.startsWith("apps/web/src/components/") &&
    !relativePath.startsWith("apps/web/src/routes/") &&
    !relativePath.startsWith("apps/web/src/hooks/") &&
    !relativePath.startsWith("apps/web/src/features/")
  ) {
    return null;
  }

  const resolvedRelative = resolveRelativeImport(filePath, importPath);
  const resolvedRelativePath = resolvedRelative ? relativeToRepo(resolvedRelative) : null;
  const importsStoreInternal =
    importPath.includes("/store/") ||
    (resolvedRelativePath?.startsWith("apps/web/src/store/") ?? false);

  if (!importsStoreInternal) {
    return null;
  }

  const allowedSuffixes = ["apps/web/src/store/index.ts", "apps/web/src/store/selectors.ts"];
  if (resolvedRelativePath && allowedSuffixes.includes(resolvedRelativePath)) {
    return null;
  }

  return "UI code must import the web store through its public entrypoints only.";
}

function checkFileSize(filePath: string): string | null {
  const relativePath = relativeToRepo(filePath);
  if (
    relativePath.includes("/__screenshots__/") ||
    relativePath.endsWith(".browser.tsx") ||
    GENERATED_SUFFIXES.some((suffix) => relativePath.endsWith(suffix))
  ) {
    return null;
  }

  const content = readFileSync(filePath, "utf8");
  const lineCount = content.split(/\r?\n/u).length;
  if (lineCount <= 700) {
    return null;
  }
  if (LEGACY_FILE_SIZE_EXEMPTIONS.has(relativePath)) {
    return null;
  }

  return `File exceeds the architecture guardrail (${lineCount} lines > 700) and must be split or explicitly exempted.`;
}

function collectViolations(): Violation[] {
  const files = [
    ...walkFiles(path.join(REPO_ROOT, "apps")),
    ...walkFiles(path.join(REPO_ROOT, "packages")),
    ...walkFiles(path.join(REPO_ROOT, "scripts")),
  ];

  const violations: Violation[] = [];

  for (const filePath of files) {
    const sourceText = readFileSync(filePath, "utf8");
    const fileSizeViolation = checkFileSize(filePath);
    if (fileSizeViolation) {
      violations.push({
        file: relativeToRepo(filePath),
        importPath: "(file)",
        message: fileSizeViolation,
      });
    }

    for (const importPath of parseImportPaths(sourceText)) {
      const boundaryViolation = checkPackageBoundaries(filePath, importPath);
      if (boundaryViolation) {
        violations.push({
          file: relativeToRepo(filePath),
          importPath,
          message: boundaryViolation,
        });
      }

      const storeViolation = checkWebStoreImports(filePath, importPath);
      if (storeViolation) {
        violations.push({
          file: relativeToRepo(filePath),
          importPath,
          message: storeViolation,
        });
      }
    }
  }

  return violations;
}

const violations = collectViolations();

if (violations.length > 0) {
  console.error("Architecture boundary check failed:");
  for (const violation of violations) {
    console.error(`- ${violation.file} -> ${violation.importPath}: ${violation.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("Architecture boundary check passed.");
}
