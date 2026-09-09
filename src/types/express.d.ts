declare global {
  namespace Express {
    interface Request {
      userId?: string;
      participantSession?: {
        participantId: string;
        eventId: string;
      };
    }
  }
}
export {};
