import 'dotenv/config';
import express from 'express';
import healthRouter from './routes/health';
import attendanceRouter from './routes/attendance';
import adminRouter from './routes/admin';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import gateRouter from './routes/gate';
import { scheduleAbsenceJob } from './jobs/absence.job';

const app = express();

app.use(express.json());
// ponytail: one line per request to stdout (never headers/body, so no tokens or student data); a log library when we ship to a host that needs JSON logs
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`));
    next();
  });
}
app.use(healthRouter);
app.use('/api/v1', authRouter);
app.use('/api/v1', attendanceRouter);
app.use('/api/v1', adminRouter);
app.use('/api/v1', usersRouter);
app.use('/api/v1', gateRouter);

export default app;

if (process.env.NODE_ENV !== 'test') {
  const PORT = Number(process.env.PORT) || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    scheduleAbsenceJob();
  });
}
