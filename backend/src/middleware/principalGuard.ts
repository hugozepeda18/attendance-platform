import { Request, Response, NextFunction } from 'express';

export function principalGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-user-role'] !== 'PRINCIPAL') {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'This action requires x-user-role: PRINCIPAL',
    });
    return;
  }
  next();
}
