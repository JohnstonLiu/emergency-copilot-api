import type { NextFunction } from "express";

const catchErrors = (controller: (req: Request, res: Response, next: NextFunction) => Promise<void>) => 
  async (req : Request, res: Response, next: NextFunction) => {
    try {
      await controller(req, res, next);
    } catch (error) {
      next(error);
    }
  }

export default catchErrors;