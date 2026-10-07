-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'TARDY', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "UpdatedByRole" AS ENUM ('SYSTEM', 'SCANNER', 'PRINCIPAL');

-- CreateTable
CREATE TABLE "SchoolConfig" (
    "id" TEXT NOT NULL,
    "schoolStartTime" TEXT NOT NULL,
    "tardyGraceMinutes" INTEGER NOT NULL DEFAULT 10,
    "absenceCutoffMinutes" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',

    CONSTRAINT "SchoolConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "credentialUid" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "group" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL,
    "guardianWhatsApp" TEXT NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "scanTimestamp" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL,
    "updatedByRole" "UpdatedByRole" NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "group" TEXT NOT NULL,
    "teacherId" TEXT,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_credentialUid_key" ON "Student"("credentialUid");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_studentId_date_key" ON "AttendanceRecord"("studentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_email_key" ON "Teacher"("email");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
