-- Additive only: two nullable columns and a new table.
ALTER TABLE "User" ADD COLUMN "accessRefreshedAt" TIMESTAMP(3);

ALTER TABLE "InstagramAccount" ADD COLUMN "appScopedId" TEXT;
CREATE UNIQUE INDEX "InstagramAccount_appScopedId_key" ON "InstagramAccount"("appScopedId");

CREATE TABLE "UserAccountGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "capabilities" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccountGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAccountGrant_userId_instagramAccountId_key" ON "UserAccountGrant"("userId", "instagramAccountId");
CREATE INDEX "UserAccountGrant_instagramAccountId_idx" ON "UserAccountGrant"("instagramAccountId");

ALTER TABLE "UserAccountGrant" ADD CONSTRAINT "UserAccountGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAccountGrant" ADD CONSTRAINT "UserAccountGrant_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
