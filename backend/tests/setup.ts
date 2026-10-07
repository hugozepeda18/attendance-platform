import 'dotenv/config';
process.env.SUPERADMIN_API_KEY = 'ak_dev_superadmin';

// Deterministic clock: only Date is faked (timers stay real so Prisma/supertest work).
// Default: Tuesday 2026-10-06 07:55 in Mexico City (UTC-6), i.e. before school starts.
// Tests move it with `setMexicoCityTime` from ./helpers.
jest.useFakeTimers({
  now: new Date('2026-10-06T13:55:00Z'),
  doNotFake: [
    'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval',
    'clearInterval', 'setTimeout', 'clearTimeout',
  ],
});
