import { Effect, Layer } from "effect";
import { ServerConfig } from "../config";
import { AnalyticsServiceLayerLive } from "../telemetry/Layers/AnalyticsService";
import { makeEventNdjsonLogger } from "../provider/Layers/EventNdjsonLogger";
import { ProviderSessionDirectoryLive } from "../provider/Layers/ProviderSessionDirectory";
import { ProviderSessionRuntimeRepositoryLive } from "../persistence/Layers/ProviderSessionRuntime";
import { makeCodexAdapterLive } from "../provider/Layers/CodexAdapter";
import { makeClaudeAdapterLive } from "../provider/Layers/ClaudeAdapter";
import { ProviderAdapterRegistryLive } from "../provider/Layers/ProviderAdapterRegistry";
import { makeProviderServiceLive } from "../provider/Layers/ProviderService";
import { CheckpointDiffQueryLive } from "../checkpointing/Layers/CheckpointDiffQuery";
import { CheckpointStoreLive } from "../checkpointing/Layers/CheckpointStore";
import { GitCoreLive } from "../git/Layers/GitCore";
import { GitHubCliLive } from "../git/Layers/GitHubCli";
import { GitStatusBroadcasterLive } from "../git/Layers/GitStatusBroadcaster";
import { RoutingTextGenerationLive } from "../git/Layers/RoutingTextGeneration";
import { TerminalManagerLive } from "../terminal/Layers/Manager";
import { GitManagerLive } from "../git/Layers/GitManager";
import { KeybindingsLive } from "../keybindings";
import { ServerRuntimeStartupLive } from "../serverRuntimeStartup";
import { OrchestrationReactorLive } from "../orchestration/Layers/OrchestrationReactor";
import { RuntimeReceiptBusLive } from "../orchestration/Layers/RuntimeReceiptBus";
import { ProviderRuntimeIngestionLive } from "../orchestration/Layers/ProviderRuntimeIngestion";
import { ProviderCommandReactorLive } from "../orchestration/Layers/ProviderCommandReactor";
import { CheckpointReactorLive } from "../orchestration/Layers/CheckpointReactor";
import { ProviderRegistryLive } from "../provider/Layers/ProviderRegistry";
import { ServerSettingsLive } from "../serverSettings";
import { ProjectFaviconResolverLive } from "../project/Layers/ProjectFaviconResolver";
import { RepositoryIdentityResolverLive } from "../project/Layers/RepositoryIdentityResolver";
import { WorkspaceEntriesLive } from "../workspace/Layers/WorkspaceEntries";
import { WorkspaceFileSystemLive } from "../workspace/Layers/WorkspaceFileSystem";
import { WorkspacePathsLive } from "../workspace/Layers/WorkspacePaths";
import { ProjectSetupScriptRunnerLive } from "../project/Layers/ProjectSetupScriptRunner";
import { ServerEnvironmentLive } from "../environment/Layers/ServerEnvironment";
import { CodexAccountManagerLive } from "../codexAccounts/Layers/CodexAccountManager";
import { ServerSecretStoreLive } from "../auth/Layers/ServerSecretStore";
import { ServerAuthLive } from "../auth/Layers/ServerAuth";
import { OrchestrationLayerLive } from "../orchestration/runtimeLayer";
import { OpenLive } from "../open";
import { ServerLifecycleEventsLive } from "../serverLifecycleEvents";
import { layerConfig as SqlitePersistenceLayerLive } from "../persistence/Layers/Sqlite";
import { PtyAdapterLive } from "./platform";

export const ReactorLayerLive = Layer.empty.pipe(
  Layer.provideMerge(OrchestrationReactorLive),
  Layer.provideMerge(ProviderRuntimeIngestionLive),
  Layer.provideMerge(ProviderCommandReactorLive),
  Layer.provideMerge(CheckpointReactorLive),
  Layer.provideMerge(RuntimeReceiptBusLive),
);

export const CheckpointingLayerLive = Layer.empty.pipe(
  Layer.provideMerge(CheckpointDiffQueryLive),
  Layer.provideMerge(CheckpointStoreLive),
);

export const ProviderLayerLive = Layer.unwrap(
  Effect.gen(function* () {
    const { providerEventLogPath } = yield* ServerConfig;
    const nativeEventLogger = yield* makeEventNdjsonLogger(providerEventLogPath, {
      stream: "native",
    });
    const canonicalEventLogger = yield* makeEventNdjsonLogger(providerEventLogPath, {
      stream: "canonical",
    });
    const providerSessionDirectoryLayer = ProviderSessionDirectoryLive.pipe(
      Layer.provide(ProviderSessionRuntimeRepositoryLive),
    );
    const codexAdapterLayer = makeCodexAdapterLive(
      nativeEventLogger ? { nativeEventLogger } : undefined,
    );
    const claudeAdapterLayer = makeClaudeAdapterLive(
      nativeEventLogger ? { nativeEventLogger } : undefined,
    );
    const adapterRegistryLayer = ProviderAdapterRegistryLive.pipe(
      Layer.provide(codexAdapterLayer),
      Layer.provide(claudeAdapterLayer),
      Layer.provideMerge(providerSessionDirectoryLayer),
    );
    return makeProviderServiceLive(
      canonicalEventLogger ? { canonicalEventLogger } : undefined,
    ).pipe(Layer.provide(adapterRegistryLayer), Layer.provide(providerSessionDirectoryLayer));
  }),
);

export const PersistenceLayerLive = Layer.empty.pipe(
  Layer.provideMerge(SqlitePersistenceLayerLive),
);

export const GitManagerLayerLive = GitManagerLive.pipe(
  Layer.provideMerge(ProjectSetupScriptRunnerLive),
  Layer.provideMerge(GitCoreLive),
  Layer.provideMerge(GitHubCliLive),
  Layer.provideMerge(RoutingTextGenerationLive),
);

export const GitLayerLive = Layer.empty.pipe(
  Layer.provideMerge(GitManagerLayerLive),
  Layer.provideMerge(GitStatusBroadcasterLive.pipe(Layer.provide(GitManagerLayerLive))),
  Layer.provideMerge(GitCoreLive),
);

export const TerminalLayerLive = TerminalManagerLive.pipe(Layer.provide(PtyAdapterLive));

export const WorkspaceLayerLive = Layer.mergeAll(
  WorkspacePathsLive,
  WorkspaceEntriesLive.pipe(Layer.provide(WorkspacePathsLive)),
  WorkspaceFileSystemLive.pipe(
    Layer.provide(WorkspacePathsLive),
    Layer.provide(WorkspaceEntriesLive.pipe(Layer.provide(WorkspacePathsLive))),
  ),
);

export const AuthLayerLive = ServerAuthLive.pipe(
  Layer.provideMerge(PersistenceLayerLive),
  Layer.provide(ServerSecretStoreLive),
);

export const CodexAccountLayerLive = CodexAccountManagerLive.pipe(
  Layer.provideMerge(ProviderLayerLive),
  Layer.provideMerge(ProviderRegistryLive),
  Layer.provideMerge(ServerSettingsLive),
);

export const RuntimeDependenciesLive = ReactorLayerLive.pipe(
  Layer.provideMerge(CheckpointingLayerLive),
  Layer.provideMerge(GitLayerLive),
  Layer.provideMerge(OrchestrationLayerLive),
  Layer.provideMerge(ProviderLayerLive),
  Layer.provideMerge(TerminalLayerLive),
  Layer.provideMerge(PersistenceLayerLive),
  Layer.provideMerge(KeybindingsLive),
  Layer.provideMerge(ProviderRegistryLive),
  Layer.provideMerge(ServerSettingsLive),
  Layer.provideMerge(CodexAccountLayerLive),
  Layer.provideMerge(WorkspaceLayerLive),
  Layer.provideMerge(ProjectFaviconResolverLive),
  Layer.provideMerge(RepositoryIdentityResolverLive),
  Layer.provideMerge(ServerEnvironmentLive),
  Layer.provideMerge(AuthLayerLive),
  Layer.provideMerge(AnalyticsServiceLayerLive),
  Layer.provideMerge(OpenLive),
  Layer.provideMerge(ServerLifecycleEventsLive),
);

export const RuntimeServicesLive = ServerRuntimeStartupLive.pipe(
  Layer.provideMerge(RuntimeDependenciesLive),
);
