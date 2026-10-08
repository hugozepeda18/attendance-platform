-- CreateTable
CREATE TABLE "SchoolCalendarDay" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolCalendarDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolCalendarDay_schoolId_date_key" ON "SchoolCalendarDay"("schoolId", "date");

-- AddForeignKey
ALTER TABLE "SchoolCalendarDay" ADD CONSTRAINT "SchoolCalendarDay_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
