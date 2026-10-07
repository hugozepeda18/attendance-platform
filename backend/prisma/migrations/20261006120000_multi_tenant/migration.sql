-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SCANNER', 'STAFF', 'PRINCIPAL');

-- DropIndex
DROP INDEX "Student_credentialUid_key";

-- DropIndex
DROP INDEX "Teacher_email_key";

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- Backfill: pre-tenant data (if any) is assigned to a "Default School" so nothing is lost.
INSERT INTO "School" ("id", "name")
SELECT 'default-school', 'Default School'
WHERE EXISTS (SELECT 1 FROM "Student") OR EXISTS (SELECT 1 FROM "SchoolConfig")
   OR EXISTS (SELECT 1 FROM "Teacher") OR EXISTS (SELECT 1 FROM "Subject");

-- AlterTable
ALTER TABLE "SchoolConfig" ADD COLUMN     "schoolId" TEXT NOT NULL DEFAULT 'default-school';
ALTER TABLE "SchoolConfig" ALTER COLUMN "schoolId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "schoolId" TEXT NOT NULL DEFAULT 'default-school';
ALTER TABLE "Student" ALTER COLUMN "schoolId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "schoolId" TEXT NOT NULL DEFAULT 'default-school';
ALTER TABLE "Subject" ALTER COLUMN "schoolId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "schoolId" TEXT NOT NULL DEFAULT 'default-school';
ALTER TABLE "Teacher" ALTER COLUMN "schoolId" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolConfig_schoolId_key" ON "SchoolConfig"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_credentialUid_key" ON "Student"("schoolId", "credentialUid");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_schoolId_email_key" ON "Teacher"("schoolId", "email");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConfig" ADD CONSTRAINT "SchoolConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AlterEnum: super-admin support edits are recorded as such
ALTER TYPE "UpdatedByRole" ADD VALUE 'SUPERADMIN';
