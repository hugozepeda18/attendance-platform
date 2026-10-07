-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "pendingScans" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SchoolConfig" ADD COLUMN     "absenceRunOn" DATE,
ADD COLUMN     "dropLeadingZeros" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "credentialUid" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "clockSkew" BOOLEAN NOT NULL DEFAULT false,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanEvent_schoolId_eventId_key" ON "ScanEvent"("schoolId", "eventId");

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

