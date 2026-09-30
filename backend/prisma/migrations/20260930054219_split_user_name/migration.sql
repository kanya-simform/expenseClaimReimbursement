-- Split `users.name` into `first_name` / `last_name`. Existing rows are
-- backfilled from `name` (whole value into first_name, empty last_name) rather
-- than deleted, since this table may not always be empty test data.

ALTER TABLE "users" ADD COLUMN "first_name" TEXT;
ALTER TABLE "users" ADD COLUMN "last_name" TEXT;

UPDATE "users" SET "first_name" = "name", "last_name" = '';

ALTER TABLE "users" ALTER COLUMN "first_name" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "last_name" SET NOT NULL;

ALTER TABLE "users" DROP COLUMN "name";
