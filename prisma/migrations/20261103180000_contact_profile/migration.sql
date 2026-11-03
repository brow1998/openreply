-- Additive only: a new table, nothing existing is touched.
CREATE TABLE "ContactProfile" (
    "id" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "igsid" TEXT NOT NULL,
    "name" TEXT,
    "username" TEXT,
    "photo" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactProfile_instagramAccountId_igsid_key" ON "ContactProfile"("instagramAccountId", "igsid");

ALTER TABLE "ContactProfile" ADD CONSTRAINT "ContactProfile_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
