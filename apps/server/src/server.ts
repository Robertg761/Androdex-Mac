import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http";

import { ServerConfig } from "./config";
import { fixPath } from "./os-jank";
import { ObservabilityLive } from "./observability/Layers/Observability";
import { ServerRuntimeStartup } from "./serverRuntimeStartup";
import {
  clearPersistedServerRuntimeState,
  makePersistedServerRuntimeState,
  persistServerRuntimeState,
} from "./serverRuntimeState";
import { RuntimeServicesLive } from "./runtime/layers";
import { HttpServerLive, PlatformServicesLive } from "./runtime/platform";
import { makeRoutesLayer } from "./runtime/routes";

export { makeRoutesLayer } from "./runtime/routes";

export const makeServerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;

    fixPath();

    const httpListeningLayer = Layer.effectDiscard(
      Effect.gen(function* () {
        yield* HttpServer.HttpServer;
        const startup = yield* ServerRuntimeStartup;
        yield* startup.markHttpListening;
      }),
    );
    const runtimeStateLayer = Layer.effectDiscard(
      Effect.acquireRelease(
        Effect.gen(function* () {
          const server = yield* HttpServer.HttpServer;
          const address = server.address;
          if (typeof address === "string" || !("port" in address)) {
            return;
          }

          const state = makePersistedServerRuntimeState({
            config,
            port: address.port,
          });
          yield* persistServerRuntimeState({
            path: config.serverRuntimeStatePath,
            state,
          });
        }),
        () => clearPersistedServerRuntimeState(config.serverRuntimeStatePath),
      ),
    );

    const routeLayer = makeRoutesLayer.pipe(HttpRouter.provideRequest(RuntimeServicesLive));

    const serverApplicationLayer = Layer.mergeAll(
      HttpRouter.serve(routeLayer, {
        disableLogger: !config.logWebSocketEvents,
      }),
      httpListeningLayer,
      runtimeStateLayer,
    );

    return serverApplicationLayer.pipe(
      Layer.provide(RuntimeServicesLive),
      Layer.provide(HttpServerLive),
      Layer.provide(ObservabilityLive),
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(PlatformServicesLive),
    );
  }),
);

// Important: Only `ServerConfig` should be provided by the CLI layer!!! Don't let other requirements leak into the launch layer.
export const runServer = Layer.launch(makeServerLayer).pipe(Effect.orDie);
