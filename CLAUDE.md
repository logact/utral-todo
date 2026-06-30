# Utral Todo — pnpm Monorepo


when modifty the table's structure in desktop,you should:
1. modify the schema in `/Users/logact/projects/utral-todo/apps/desktop/src/db/schema.ts`
2. modify the related model or entities
3. use `pnpm db:generate` to generate migration file