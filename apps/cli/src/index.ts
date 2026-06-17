#!/usr/bin/env node
import { program } from "commander";
import { setJsonMode, setQuietMode } from "./output.js";
import { setClientOptions } from "./client.js";
import { readConfig } from "./config.js";
import { registerTodoCommand } from "./commands/todo.js";
import { registerPluseCommand } from "./commands/pluse.js";
import { registerTimerCommand } from "./commands/timer.js";
import { registerRelationCommand } from "./commands/relation.js";
import { registerLogCommand } from "./commands/log.js";
import { registerActionEdgeCommand } from "./commands/action-edge.js";
import { registerHealthCommand } from "./commands/health.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerLabelCommand } from "./commands/label.js";

const cfg = readConfig();

program
  .name("utral-todo-cli")
  .description("CLI for operating utral-todo data via the REST API")
  .version("1.0.0")
  .option("-j, --json", "output structured JSON for AI consumption")
  .option("-q, --quiet", "suppress non-essential output")
  .option("-a, --api <url>", "API base URL", cfg.api ?? "http://localhost:3001")
  .option("-t, --token <token>", "API auth token", cfg.token)
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.json) setJsonMode(true);
    if (opts.quiet) setQuietMode(true);
    setClientOptions({ baseUrl: opts.api, token: opts.token });
  });

registerConfigCommand(program);
registerHealthCommand(program);
registerTodoCommand(program);
registerPluseCommand(program);
registerTimerCommand(program);
registerRelationCommand(program);
registerLogCommand(program);
registerActionEdgeCommand(program);
registerSyncCommand(program);
registerLabelCommand(program);

program.parse();
