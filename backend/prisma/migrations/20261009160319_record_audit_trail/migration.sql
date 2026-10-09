-- CreateTable
CREATE TABLE "RecordChange" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fromStatus" "AttendanceStatus",
    "toStatus" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "byRole" "UpdatedByRole" NOT NULL,
    "byUserId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordChange_recordId_at_idx" ON "RecordChange"("recordId", "at");

-- AddForeignKey
ALTER TABLE "RecordChange" ADD CONSTRAINT "RecordChange_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordChange" ADD CONSTRAINT "RecordChange_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordChange" ADD CONSTRAINT "RecordChange_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Audit trail trigger: every insert, and every update that changes status or note, adds a RecordChange.
CREATE FUNCTION record_change_audit() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" = NEW."status" AND OLD."note" IS NOT DISTINCT FROM NEW."note" THEN
    RETURN NEW;
  END IF;
  INSERT INTO "RecordChange" ("id", "schoolId", "recordId", "fromStatus", "toStatus", "note", "byRole", "byUserId")
  SELECT gen_random_uuid()::text, s."schoolId", NEW."id",
         CASE WHEN TG_OP = 'UPDATE' THEN OLD."status" END,
         NEW."status", NEW."note", NEW."updatedByRole", NEW."updatedByUserId"
  FROM "Student" s WHERE s."id" = NEW."studentId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attendance_record_audit
AFTER INSERT OR UPDATE ON "AttendanceRecord"
FOR EACH ROW EXECUTE FUNCTION record_change_audit();

-- Records that existed before the trail: their current state is the first entry.
INSERT INTO "RecordChange" ("id", "schoolId", "recordId", "toStatus", "note", "byRole", "byUserId")
SELECT gen_random_uuid()::text, s."schoolId", r."id", r."status", r."note", r."updatedByRole", r."updatedByUserId"
FROM "AttendanceRecord" r JOIN "Student" s ON s."id" = r."studentId";
