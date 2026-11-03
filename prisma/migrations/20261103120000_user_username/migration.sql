-- Additive only: a nullable handle chosen by the user. Existing rows stay NULL.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
-- Case-insensitive uniqueness; NULLs are not compared, so unset handles never clash.
CREATE UNIQUE INDEX "User_username_lower_key" ON "User"(LOWER("username"));
