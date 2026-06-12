import { type Command } from "commander";
import { readConfig, setConfigValue, getConfigValue } from "../config.js";
import { out } from "../output.js";

export function registerConfigCommand(program: Command) {
  const config = program.command("config").description("manage CLI configuration");

  config
    .command("get")
    .description("show current config")
    .argument("[key]", "config key (api or token)")
    .action((key?: string) => {
      const cfg = readConfig();
      if (key) {
        out({ key, value: cfg[key as keyof typeof cfg] ?? null });
      } else {
        out(cfg);
      }
    });

  config
    .command("set")
    .description("set a config value")
    .argument("<key>", "config key (api or token)")
    .argument("<value>", "value to set")
    .action((key: string, value: string) => {
      if (key !== "api" && key !== "token") {
        out({ error: `Unknown key: ${key}. Use 'api' or 'token'.` });
        process.exit(1);
      }
      setConfigValue(key, value);
      out({ success: true, key, value });
    });

  config
    .command("unset")
    .description("remove a config value")
    .argument("<key>", "config key (api or token)")
    .action((key: string) => {
      if (key !== "api" && key !== "token") {
        out({ error: `Unknown key: ${key}. Use 'api' or 'token'.` });
        process.exit(1);
      }
      setConfigValue(key, undefined);
      out({ success: true, key, removed: true });
    });
}
