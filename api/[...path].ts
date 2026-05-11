let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appPromise) {
      let mod: any;
      try {
        mod = await import("../server/app.js");
      } catch {
        mod = await import("../server/app.js");
      }
      appPromise = mod.createApp();
    }
    const app = await appPromise;
    return app(req, res);
  } catch (err: any) {
    console.error("API handler crash:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: err?.message || "Serverless function crashed" }));
      return;
    }
  }
}
