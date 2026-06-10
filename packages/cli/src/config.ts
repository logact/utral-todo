import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface Config {
  api?: string;
  token?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "utral");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function readConfig(): Config {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Config;
    }
  } catch {
    // ignore corrupt config
  }
  return {};
}

export function writeConfig(config: Config) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

export function setConfigValue(key: keyof Config, value: string | undefined) {
  const config = readConfig();
  if (value === undefined) {
    delete config[key];
  } else {
    config[key] = value;
  }
  writeConfig(config);
}

export function getConfigValue(key: keyof Config): string | undefined {
  return readConfig()[key];
}
