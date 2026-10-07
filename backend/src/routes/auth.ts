import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getMe, getPublicSchool, postLogin, postLogout } from '../controllers/auth.controller';

const router = Router();

router.get('/public/schools/:slug', getPublicSchool);
router.post('/auth/login', postLogin);
router.post('/auth/logout', authenticate, postLogout);
router.get('/me', authenticate, getMe);

export default router;
