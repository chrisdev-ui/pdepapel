import cron from "node-cron";
import { env } from "./env.mjs";

export function initDevCron() {
  if (env.NODE_ENV === "development") {
    cron.schedule("0 0 * * *", async () => {
      try {
        const response = await fetch("/api/cron/update-coupons", {
          headers: {
            Authorization: `Bearer ${env.CRON_SECRET}`,
          },
        });
        const result = await response.json();
        console.log("CRON JOB RESULT:", result);
      } catch (error) {
        console.error("CRON JOB ERROR:", error);
      }
    });
  }
}
