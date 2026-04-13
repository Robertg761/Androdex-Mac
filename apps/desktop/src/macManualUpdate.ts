import * as ChildProcess from "node:child_process";
import * as Crypto from "node:crypto";
import * as FS from "node:fs";
import * as Path from "node:path";

export interface GitHubUpdateFeedConfig {
  readonly owner: string;
  readonly repo: string;
  readonly token?: string;
}

export interface MacUpdateManifestFile {
  readonly url: string;
  readonly sha512: string | null;
  readonly size: number | null;
}

export interface MacUpdateManifest {
  readonly version: string;
  readonly path: string | null;
  readonly sha512: string | null;
  readonly files: readonly MacUpdateManifestFile[];
}

export interface MacAvailableUpdate {
  readonly version: string;
  readonly manifestUrl: string;
  readonly archiveUrl: string;
  readonly archiveName: string;
  readonly sha512: string | null;
}

export interface MacDownloadedUpdate extends MacAvailableUpdate {
  readonly archivePath: string;
  readonly stagedAppPath: string;
  readonly targetAppPath: string;
  readonly workingDirectory: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function appleScriptQuote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runCommand(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = ChildProcess.spawn(command, args, {
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function parseSize(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLatestMacUpdateManifest(raw: string): MacUpdateManifest {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let version: string | null = null;
  let path: string | null = null;
  let sha512: string | null = null;
  const files: MacUpdateManifestFile[] = [];
  let currentFile: {
    url: string | null;
    sha512: string | null;
    size: number | null;
  } | null = null;

  const flushCurrentFile = () => {
    if (!currentFile) return;
    if (!currentFile.url) {
      throw new Error("Invalid latest-mac.yml: missing file url.");
    }
    files.push({
      url: currentFile.url,
      sha512: currentFile.sha512,
      size: currentFile.size,
    });
    currentFile = null;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line === "files:") {
      flushCurrentFile();
      continue;
    }
    if (line.startsWith("  - url: ")) {
      flushCurrentFile();
      currentFile = {
        url: line.slice("  - url: ".length).trim(),
        sha512: null,
        size: null,
      };
      continue;
    }
    if (line.startsWith("    sha512: ")) {
      if (!currentFile) {
        throw new Error("Invalid latest-mac.yml: file sha512 without file url.");
      }
      currentFile.sha512 = line.slice("    sha512: ".length).trim();
      continue;
    }
    if (line.startsWith("    size: ")) {
      if (!currentFile) {
        throw new Error("Invalid latest-mac.yml: file size without file url.");
      }
      currentFile.size = parseSize(line.slice("    size: ".length).trim());
      continue;
    }
    if (line.startsWith("version: ")) {
      version = line.slice("version: ".length).trim();
      continue;
    }
    if (line.startsWith("path: ")) {
      path = line.slice("path: ".length).trim();
      continue;
    }
    if (line.startsWith("sha512: ")) {
      sha512 = line.slice("sha512: ".length).trim();
      continue;
    }
  }

  flushCurrentFile();

  if (!version) {
    throw new Error("Invalid latest-mac.yml: missing version.");
  }

  return {
    version,
    path,
    sha512,
    files,
  };
}

function parseSemanticVersion(value: string): {
  readonly coreParts: readonly number[];
  readonly prerelease: string;
} {
  const [core = "", prerelease = ""] = value.trim().split("-", 2);
  const coreParts = core.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return { coreParts, prerelease };
}

export function compareSemanticVersions(left: string, right: string): number {
  const leftParsed = parseSemanticVersion(left);
  const rightParsed = parseSemanticVersion(right);
  const maxLength = Math.max(leftParsed.coreParts.length, rightParsed.coreParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParsed.coreParts[index] ?? 0;
    const rightPart = rightParsed.coreParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  if (leftParsed.prerelease === rightParsed.prerelease) {
    return 0;
  }
  if (!leftParsed.prerelease) {
    return 1;
  }
  if (!rightParsed.prerelease) {
    return -1;
  }
  return leftParsed.prerelease.localeCompare(rightParsed.prerelease, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function isSemanticVersionNewer(candidate: string, current: string): boolean {
  return compareSemanticVersions(candidate, current) > 0;
}

export function resolveGitHubManifestUrl(config: GitHubUpdateFeedConfig): string {
  return `https://github.com/${config.owner}/${config.repo}/releases/latest/download/latest-mac.yml`;
}

export function resolveGitHubAssetUrl(config: GitHubUpdateFeedConfig, assetName: string): string {
  return `https://github.com/${config.owner}/${config.repo}/releases/latest/download/${assetName}`;
}

function getRequestHeaders(config: GitHubUpdateFeedConfig): HeadersInit | undefined {
  if (!config.token) return undefined;
  return {
    Authorization: `Bearer ${config.token}`,
  };
}

export async function fetchMacUpdateManifest(
  config: GitHubUpdateFeedConfig,
): Promise<{ readonly manifest: MacUpdateManifest; readonly manifestUrl: string }> {
  const manifestUrl = resolveGitHubManifestUrl(config);
  const headers = getRequestHeaders(config);
  const response = await fetch(manifestUrl, {
    ...(headers ? { headers } : {}),
  });
  if (!response.ok) {
    throw new Error(`Update metadata request failed with ${response.status}.`);
  }
  const text = await response.text();
  return {
    manifest: parseLatestMacUpdateManifest(text),
    manifestUrl,
  };
}

export function resolveMacAvailableUpdate(
  manifest: MacUpdateManifest,
  config: GitHubUpdateFeedConfig,
): MacAvailableUpdate {
  const preferredFile =
    (manifest.path ? manifest.files.find((file) => file.url === manifest.path) : null) ??
    manifest.files.find((file) => file.url.endsWith(".zip"));

  const archiveName = preferredFile?.url ?? manifest.path;
  if (!archiveName) {
    throw new Error("Update metadata did not include a downloadable macOS archive.");
  }
  const sha512 = preferredFile?.sha512 ?? manifest.sha512;

  return {
    version: manifest.version,
    manifestUrl: resolveGitHubManifestUrl(config),
    archiveUrl: resolveGitHubAssetUrl(config, archiveName),
    archiveName,
    sha512,
  };
}

export async function downloadFileWithProgress(args: {
  readonly url: string;
  readonly destinationPath: string;
  readonly token?: string;
  readonly expectedSha512?: string | null;
  readonly onProgress?: (percent: number) => void;
}): Promise<void> {
  const headers = args.token
    ? {
        Authorization: `Bearer ${args.token}`,
      }
    : null;
  const response = await fetch(args.url, {
    ...(headers ? { headers } : {}),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download request failed with ${response.status}.`);
  }

  const totalBytesHeader = response.headers.get("content-length");
  const totalBytes = totalBytesHeader ? Number.parseInt(totalBytesHeader, 10) : Number.NaN;
  const hasKnownLength = Number.isFinite(totalBytes) && totalBytes > 0;
  const hash = Crypto.createHash("sha512");

  await FS.promises.mkdir(Path.dirname(args.destinationPath), { recursive: true });

  const writer = FS.createWriteStream(args.destinationPath);
  let downloadedBytes = 0;
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = value;
      downloadedBytes += chunk.byteLength;
      hash.update(chunk);
      await new Promise<void>((resolve, reject) => {
        writer.write(chunk, (error: Error | null | undefined) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      if (hasKnownLength) {
        args.onProgress?.((downloadedBytes / totalBytes) * 100);
      }
    }
    await new Promise<void>((resolve, reject) => {
      writer.end((error: Error | null | undefined) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } catch (error) {
    writer.destroy();
    throw error;
  }

  const digest = hash.digest("base64");
  if (args.expectedSha512 && digest !== args.expectedSha512) {
    throw new Error("Downloaded update failed SHA-512 verification.");
  }

  args.onProgress?.(100);
}

export async function extractMacUpdateZip(
  archivePath: string,
  destinationDirectory: string,
): Promise<string> {
  await FS.promises.rm(destinationDirectory, { recursive: true, force: true });
  await FS.promises.mkdir(destinationDirectory, { recursive: true });
  await runCommand("/usr/bin/ditto", ["-x", "-k", archivePath, destinationDirectory]);

  const stagedAppPath = findFirstAppBundle(destinationDirectory);
  if (!stagedAppPath) {
    throw new Error("Downloaded update did not contain an app bundle.");
  }
  return stagedAppPath;
}

export function findFirstAppBundle(rootPath: string): string | null {
  const entries = FS.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = Path.join(rootPath, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return entryPath;
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = findFirstAppBundle(Path.join(rootPath, entry.name));
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function resolveCurrentAppBundlePath(executablePath: string): string | null {
  let currentPath = Path.resolve(executablePath);
  while (currentPath !== Path.dirname(currentPath)) {
    if (currentPath.endsWith(".app")) {
      return currentPath;
    }
    currentPath = Path.dirname(currentPath);
  }
  return null;
}

export function resolveTargetAppBundlePath(currentBundlePath: string | null): string {
  if (currentBundlePath && !currentBundlePath.startsWith("/Volumes/")) {
    return currentBundlePath;
  }
  const appBundleName = currentBundlePath ? Path.basename(currentBundlePath) : "Androdex.app";
  return Path.join("/Applications", appBundleName);
}

export async function prepareMacDownloadedUpdate(args: {
  readonly availableUpdate: MacAvailableUpdate;
  readonly cacheDirectory: string;
  readonly token?: string;
  readonly currentBundlePath: string | null;
  readonly onProgress?: (percent: number) => void;
}): Promise<MacDownloadedUpdate> {
  const workingDirectory = Path.join(args.cacheDirectory, args.availableUpdate.version);
  const archivePath = Path.join(workingDirectory, args.availableUpdate.archiveName);
  const tempArchivePath = `${archivePath}.download`;
  const stagedDirectory = Path.join(workingDirectory, "staged");

  await FS.promises.rm(workingDirectory, { recursive: true, force: true });
  await FS.promises.mkdir(workingDirectory, { recursive: true });

  await downloadFileWithProgress({
    url: args.availableUpdate.archiveUrl,
    destinationPath: tempArchivePath,
    ...(args.token ? { token: args.token } : {}),
    ...(args.availableUpdate.sha512 ? { expectedSha512: args.availableUpdate.sha512 } : {}),
    ...(args.onProgress ? { onProgress: args.onProgress } : {}),
  });
  await FS.promises.rename(tempArchivePath, archivePath);

  const stagedAppPath = await extractMacUpdateZip(archivePath, stagedDirectory);
  const targetAppPath = resolveTargetAppBundlePath(args.currentBundlePath);

  return {
    ...args.availableUpdate,
    archivePath,
    stagedAppPath,
    targetAppPath,
    workingDirectory,
  };
}

export async function launchMacAppReplacementInstaller(args: {
  readonly currentPid: number;
  readonly downloadedUpdate: MacDownloadedUpdate;
}): Promise<void> {
  const scriptPath = Path.join(args.downloadedUpdate.workingDirectory, "install-update.sh");
  const logPath = Path.join(args.downloadedUpdate.workingDirectory, "install-update.log");
  const targetDirectory = Path.dirname(args.downloadedUpdate.targetAppPath);
  const stagedAppPath = args.downloadedUpdate.stagedAppPath;
  const targetAppPath = args.downloadedUpdate.targetAppPath;
  const workingDirectory = args.downloadedUpdate.workingDirectory;
  const installCommand = [
    "mkdir -p",
    shellQuote(targetDirectory),
    "&& rm -rf",
    shellQuote(targetAppPath),
    "&& ditto",
    shellQuote(stagedAppPath),
    shellQuote(targetAppPath),
  ].join(" ");
  const adminInstallCommand = appleScriptQuote(installCommand);

  const script = `#!/bin/bash
set -euo pipefail

PID=${args.currentPid}
TARGET=${shellQuote(targetAppPath)}
TARGET_DIR=${shellQuote(targetDirectory)}
STAGED=${shellQuote(stagedAppPath)}
WORKDIR=${shellQuote(workingDirectory)}
LOG=${shellQuote(logPath)}

exec >>"$LOG" 2>&1

echo "[mac-update] helper started"
while kill -0 "$PID" 2>/dev/null; do
  sleep 0.5
done
sleep 1

install_directly() {
  mkdir -p "$TARGET_DIR"
  rm -rf "$TARGET"
  ditto "$STAGED" "$TARGET"
}

if [ -w "$TARGET_DIR" ] && { [ ! -e "$TARGET" ] || [ -w "$TARGET" ]; }; then
  install_directly
else
  if ! /usr/bin/osascript <<'APPLESCRIPT'
do shell script "${adminInstallCommand}" with administrator privileges
APPLESCRIPT
  then
    /usr/bin/open -R "$STAGED" || true
    exit 1
  fi
fi

/usr/bin/open -n "$TARGET"
rm -rf "$WORKDIR"
`;

  await FS.promises.writeFile(scriptPath, script, {
    encoding: "utf8",
    mode: 0o755,
  });

  const child = ChildProcess.spawn("/bin/bash", [scriptPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
