import 'dotenv/config';
import express from 'express';
import healthRouter from './routes/health';
import attendanceRouter from './routes/attendance';
import { scheduleAbsenceJob } from './jobs/absence.job';

const app = express();

app.use(express.json());
app.use(healthRouter);
app.use('/api/v1', attendanceRouter);

export default app;

if (process.env.NODE_ENV !== 'test') {
  const PORT = Number(process.env.PORT) || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    scheduleAbsenceJob().catch(console.error);
  });
}
