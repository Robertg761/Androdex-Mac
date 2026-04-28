import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliError, Command } from "effect/unstable/cli";

import { NetService } from "@t3tools/shared/Net";
import { cli } from "./cli.ts";
import packageJson from "../package.json" with { type: "json" };

const CliRuntimeLayer = Layer.mergeAll(NodeServices.layer, NetService.layer);

const normalizeCliErrors = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchIf(
      (_error): _error is E => true,
      (error) => (CliError.isCliError(error) ? Effect.fail(error) : Effect.die(error)),
    ),
  );

const program = Command.run(cli, { version: packageJson.version }).pipe(
  normalizeCliErrors,
  Effect.scoped,
  Effect.provide(CliRuntimeLayer),
) as Effect.Effect<void, CliError.CliError>;

NodeRuntime.runMain(program);
