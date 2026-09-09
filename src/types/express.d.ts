import type { AttendanceActor } from "../shared/middlewares/attendance.auth.middleware.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      participantSession?: {
        participantId: string;
        eventId: string;
      };
      attendanceActor?: AttendanceActor;
    }
  }
}
export {};
