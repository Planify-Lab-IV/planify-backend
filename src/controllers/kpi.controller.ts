import type { NextFunction, Request, Response } from "express";
import type { KpiService } from "../services/kpi.service.js";
import { validateKpiDayQuery } from "../validators/kpi/kpi.validator.js";

export interface KpiController {
  getInternalKpis(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createKpiController(kpiService: KpiService): KpiController {
  return {
    async getInternalKpis(req, res, next) {
      try {
        const day = validateKpiDayQuery(req.query);
        const kpis = await kpiService.getInternalKpis(day);

        res.status(200).json(kpis);
      } catch (error) {
        next(error);
      }
    },
  };
}
