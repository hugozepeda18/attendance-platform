import { Prisma, Student } from '@prisma/client';
import { getSchoolConfig } from '../repositories/schoolConfig.repository';
import {
  createStudent,
  findStudentByCredentialUid,
  findStudentById,
  listGroups,
  listStudents,
  updateStudent,
} from '../repositories/student.repository';
import { normalizeCredential } from './attendance.service';

export class BadgeTakenError extends Error {
  constructor(public holder: string) {
    super(`Esa credencial ya es de ${holder}`);
  }
}

export interface StudentFields {
  firstName: string;
  lastName: string;
  grade: number;
  group: string;
  credentialUid: string;
  guardianName: string;
  guardianWhatsApp: string;
  whatsappOptOut: boolean;
  active: boolean;
}

const view = (s: Student) => ({
  id: s.id,
  firstName: s.firstName,
  lastName: s.lastName,
  grade: s.grade,
  group: s.group,
  credentialUid: s.credentialUid,
  guardianName: s.guardianName,
  guardianWhatsApp: s.guardianWhatsApp,
  whatsappOptOut: s.whatsappOptOut,
  active: s.active,
});

export async function getStudents(schoolId: string, grade?: number, group?: string) {
  return (await listStudents(schoolId, grade, group)).map(view);
}

export async function getGroups(schoolId: string) {
  return (await listGroups(schoolId)).map((g) => ({ grade: g.grade, group: g.group, students: g._count }));
}

// Badges are stored the way the gate will read them (same normalization as scans), and one badge
// belongs to one student, withdrawn students included: free it by giving that student another badge.
async function badge(schoolId: string, raw: string, ownerId?: string): Promise<string> {
  const config = await getSchoolConfig(schoolId);
  const uid = normalizeCredential(raw, config?.dropLeadingZeros ?? false);
  const holder = await findStudentByCredentialUid(schoolId, uid);
  if (holder && holder.id !== ownerId) throw new BadgeTakenError(`${holder.firstName} ${holder.lastName}`);
  return uid;
}

export async function addStudent(schoolId: string, input: Omit<StudentFields, 'active'>) {
  const credentialUid = await badge(schoolId, input.credentialUid);
  return view(await createStudent({ ...input, credentialUid, schoolId }).catch(rethrowBadge));
}

export async function editStudent(schoolId: string, id: string, input: Partial<StudentFields>) {
  const student = await findStudentById(schoolId, id);
  if (!student) return null;
  const credentialUid = input.credentialUid === undefined ? undefined : await badge(schoolId, input.credentialUid, id);
  return view(await updateStudent(id, { ...input, credentialUid }).catch(rethrowBadge));
}

// Two principals saving the same badge at once: the database unique index decides.
function rethrowBadge(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new BadgeTakenError('otro alumno');
  throw err;
}
