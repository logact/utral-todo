-- AlterTable
ALTER TABLE "Pluse" ADD COLUMN "intervalTodos" JSONB;
ALTER TABLE "Pluse" ADD COLUMN "autoAdvance" BOOLEAN NOT NULL DEFAULT true;
