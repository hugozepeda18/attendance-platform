import { ScanAlertParams, AbsenceAlertParams } from '../types/attendance.types';

export interface NotifierService {
  sendScanAlert(params: ScanAlertParams): Promise<void>;
  sendAbsenceAlert(params: AbsenceAlertParams): Promise<void>;
}

const consoleNotifier: NotifierService = {
  async sendScanAlert({ guardianWhatsApp, studentName, status, timestamp }) {
    console.log(
      `[WhatsApp] → ${guardianWhatsApp}: "${studentName}" entered school as ${status} at ${timestamp.toISOString()}`,
    );
  },
  async sendAbsenceAlert({ guardianWhatsApp, studentName, date }) {
    const dateStr = date.toISOString().split('T')[0];
    console.log(
      `[WhatsApp] → ${guardianWhatsApp}: Absence alert for "${studentName}" on ${dateStr}`,
    );
  },
};

export const notifier: NotifierService = consoleNotifier;
