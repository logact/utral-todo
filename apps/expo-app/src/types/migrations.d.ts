declare module '*.sql' {
  const content: string;
  export default content;
}

declare module '../drizzle/migrations' {
  import type { MigrationConfig } from 'drizzle-orm/expo-sqlite/migrator';
  const migrations: MigrationConfig;
  export default migrations;
}
