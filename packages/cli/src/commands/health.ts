import { type Command } from "commander";
import { api } from "../client.js";
import { out } from "../output.js";

export function registerHealthCommand(program: Command) {
  program
    .command("health")
    .description("check API server health")
    .action(async () => {
      const res = await api.get<{ status: string }>("/api/health");
      out({
        success: res.success,
        status: res.status,
        data: res.data,
        error: res.error,
      });
      if (!res.success) process.exit(1);
    });
}
