export interface ScanAlertParams {
  guardianWhatsApp: string;
  guardianName: string;
  studentName: string;
  status: 'PRESENT' | 'TARDY';
  timestamp: Date;
}

export interface AbsenceAlertParams {
  guardianWhatsApp: string;
  guardianName: string;
  studentName: string;
  date: Date;
}
