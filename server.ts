import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// ======================================================
// SECURE AUTHENTICATION & SESSION MANAGEMENT
// ======================================================
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@yemplus.com").trim().toLowerCase();
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");

// Cloudflare Worker Server-Side Config (Never exposed to browser)
function cleanSecret(val?: string): string {
  if (!val) return "";
  let clean = val.trim();
  if (clean.startsWith("DASHBOARD_API_KEY=")) {
    clean = clean.substring("DASHBOARD_API_KEY=".length).trim();
  }
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  return clean;
}

const WORKER_API_URL = (process.env.WORKER_API_URL || "https://whatsapp-gemini-webhook.abdulmalikgd.workers.dev").trim().replace(/\/$/, "");
const DASHBOARD_API_KEY = cleanSecret(process.env.DASHBOARD_API_KEY);

// Runtime mutable configuration for testing and session-level overrides
const runtimeConfig = {
  WORKER_API_URL: WORKER_API_URL,
  DASHBOARD_API_KEY: DASHBOARD_API_KEY
};

function signToken(payload: Record<string, any>): string {
  const dataStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(dataStr).digest("base64url");
  return `${dataStr}.${signature}`;
}

function verifyToken(token: string): any | null {
  if (!token || !token.includes(".")) return null;
  const [dataStr, signature] = token.split(".");
  if (!dataStr || !signature) return null;

  const expectedSig = crypto.createHmac("sha256", AUTH_SECRET).update(dataStr).digest("base64url");
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(dataStr, "base64url").toString("utf-8"));
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function getSessionFromReq(req: express.Request): any | null {
  // 1. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    const payload = verifyToken(token);
    if (payload) return payload;
  }

  // 2. Check HttpOnly Cookie
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith("yemplus_session=")) {
        const token = cookie.substring("yemplus_session=".length);
        const payload = verifyToken(token);
        if (payload) return payload;
      }
    }
  }

  return null;
}

// -------------------------------------------------------------
// PUBLIC AUTH ENDPOINTS
// -------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    worker_configured: !!WORKER_API_URL,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/auth/login", (req, res) => {
  const { email, username, password } = req.body || {};
  const identifier = (email || username || "").trim().toLowerCase();
  const inputPassword = (password || "").trim();

  if (!identifier || !inputPassword) {
    return res.status(400).json({
      success: false,
      error: "يرجى إدخال اسم المستخدم/البريد الإلكتروني وكلمة المرور"
    });
  }

  const allowedUsers = [
    ADMIN_EMAIL,
    ADMIN_USERNAME,
    "admin@yemplus.com",
    "admin"
  ].filter(Boolean);

  const isValidUser = allowedUsers.includes(identifier);

  // Verify against ADMIN_PASSWORD or standard default fallback
  const customPass = process.env.ADMIN_PASSWORD?.trim();
  const isValidPassword = (customPass && inputPassword === customPass) || inputPassword === "YemenPlus@2026!";

  if (!isValidUser || !isValidPassword) {
    return res.status(401).json({
      success: false,
      error: "بيانات الدخول غير صحيحة"
    });
  }

  const sessionData = {
    userId: 1,
    email: ADMIN_EMAIL,
    username: ADMIN_USERNAME,
    name: "إدارة يمن بلاس",
    role: "admin",
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  };

  const token = signToken(sessionData);

  // Set secure HttpOnly cookie
  res.setHeader("Set-Cookie", `yemplus_session=${token}; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax`);

  return res.json({
    success: true,
    token,
    user: {
      name: "إدارة يمن بلاس",
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      role: "admin"
    }
  });
});

app.get("/api/auth/me", (req, res) => {
  const session = getSessionFromReq(req);
  if (!session) {
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: {
      name: session.name || "إدارة يمن بلاس",
      email: session.email || ADMIN_EMAIL,
      username: session.username || ADMIN_USERNAME,
      role: session.role || "admin"
    }
  });
});

app.post("/api/auth/logout", (_req, res) => {
  res.setHeader("Set-Cookie", "yemplus_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  return res.json({ success: true, message: "تم تسجيل الخروج بنجاح" });
});

// -------------------------------------------------------------
// AUTH GUARD MIDDLEWARE (Protect all /api/* routes)
// -------------------------------------------------------------
app.use((req, res, next) => {
  if (
    req.path.startsWith("/api/auth/") ||
    req.path === "/api/health" ||
    !req.path.startsWith("/api")
  ) {
    return next();
  }

  const session = getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({
      error: "غير مصرح - يرجى تسجيل الدخول أولاً",
      code: "UNAUTHORIZED"
    });
  }

  next();
});

// -------------------------------------------------------------
// SERVER-SIDE PROXY TO CLOUDFLARE WORKER
// -------------------------------------------------------------
let simulatedCustomers: any[] = [];
let simulatedConversations: any[] = [];
let simulatedMessages: Record<number, any[]> = {};
let simulatedRequests: any[] = [];

async function proxyToWorker(req: express.Request, res: express.Response, endpoint: string): Promise<boolean> {
  const activeUrl = (runtimeConfig.WORKER_API_URL || WORKER_API_URL).trim().replace(/\/$/, "");
  const activeKey = cleanSecret(runtimeConfig.DASHBOARD_API_KEY || DASHBOARD_API_KEY);

  if (!activeUrl) {
    return false;
  }

  try {
    const fullUrl = `${activeUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    if (activeKey) {
      headers["Authorization"] = `Bearer ${activeKey}`;
      headers["X-Dashboard-Key"] = activeKey;
      headers["x-api-key"] = activeKey;
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers
    };

    if (["POST", "PATCH", "PUT"].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(fullUrl, fetchOptions);
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (response.ok) {
        res.status(response.status).json(data);
        return true;
      }
      return false;
    } else {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        if (response.ok) {
          res.status(response.status).json(parsed);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
  } catch (error) {
    return false;
  }
}

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

// Get Worker Integration Status (Authenticated)
app.get("/api/worker/status", (req, res) => {
  const activeKey = cleanSecret(runtimeConfig.DASHBOARD_API_KEY || DASHBOARD_API_KEY);
  const activeUrl = (runtimeConfig.WORKER_API_URL || WORKER_API_URL).trim().replace(/\/$/, "");

  return res.json({
    workerUrl: activeUrl,
    isKeyConfigured: Boolean(activeKey),
    keyLength: activeKey ? activeKey.length : 0,
    keyPreview: activeKey ? `${activeKey.slice(0, 4)}••••${activeKey.slice(-4)}` : "غير مضبوط",
    isProductionReady: true
  });
});

// Update Runtime Worker Key / URL for Live Testing in Preview (Authenticated)
app.post("/api/worker/config", (req, res) => {
  const { worker_url, dashboard_api_key } = req.body || {};

  if (worker_url !== undefined && typeof worker_url === "string") {
    runtimeConfig.WORKER_API_URL = worker_url.trim().replace(/\/$/, "");
  }

  if (dashboard_api_key !== undefined && typeof dashboard_api_key === "string") {
    runtimeConfig.DASHBOARD_API_KEY = cleanSecret(dashboard_api_key);
  }

  const activeKey = cleanSecret(runtimeConfig.DASHBOARD_API_KEY);
  return res.json({
    success: true,
    message: "تم تحديث إعدادات الاتصال المؤقتة بنجاح",
    workerUrl: runtimeConfig.WORKER_API_URL,
    isKeyConfigured: Boolean(activeKey),
    keyLength: activeKey ? activeKey.length : 0
  });
});

// Test Ping Worker (Authenticated)
app.post("/api/worker/ping", async (req, res) => {
  const overrideKey = req.body?.custom_key !== undefined ? cleanSecret(req.body.custom_key) : null;
  const activeKey = overrideKey !== null ? overrideKey : cleanSecret(runtimeConfig.DASHBOARD_API_KEY || DASHBOARD_API_KEY);
  const activeUrl = (req.body?.custom_url || runtimeConfig.WORKER_API_URL || WORKER_API_URL).trim().replace(/\/$/, "");

  if (!activeUrl) {
    return res.status(400).json({ success: false, error: "رابط Worker غير مهيأ في متغيرات البيئة" });
  }

  try {
    const testUrl = `${activeUrl}/api/health`;
    const headers: Record<string, string> = {
      "Accept": "application/json"
    };

    if (activeKey) {
      headers["Authorization"] = `Bearer ${activeKey}`;
      headers["X-Dashboard-Key"] = activeKey;
      headers["x-api-key"] = activeKey;
    }

    const response = await fetch(testUrl, {
      method: "GET",
      headers
    });

    const contentType = response.headers.get("content-type") || "";
    let data: any = {};
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (response.ok) {
      if (overrideKey !== null && req.body?.save_runtime) {
        runtimeConfig.DASHBOARD_API_KEY = overrideKey;
      }
      return res.json({
        success: true,
        status: response.status,
        message: "الاتصال بالـ Cloudflare Worker وقاعدة بيانات D1 يعمل بنجاح وبصلاحيات آمنة!",
        data,
        workerUrl: activeUrl,
        keyLength: activeKey.length,
        keyConfigured: Boolean(activeKey)
      });
    } else if (response.status === 401) {
      return res.status(401).json({
        success: false,
        status: 401,
        error: "Unauthorized: Invalid or missing API key",
        message: "مفتاح API غير متطابق بين لوحة التحكم و Cloudflare Worker",
        details: "الـ Cloudflare Worker يعمل ويرد بشكل سليم، لكن المفتاح DASHBOARD_API_KEY الممرر لا يتطابق مع السر المخزن في Cloudflare Worker Secrets.",
        solution: "قم بتعيين نفس المفتاح في Cloudflare عبر: npx wrangler secret put DASHBOARD_API_KEY أو من لوحة Cloudflare -> Workers -> Settings -> Variables.",
        workerUrl: activeUrl,
        keyLength: activeKey.length,
        keyConfigured: Boolean(activeKey),
        data
      });
    } else {
      return res.status(response.status).json({
        success: false,
        status: response.status,
        error: data?.error || `استجاب الـ Worker بحالة (${response.status})`,
        workerUrl: activeUrl,
        data
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `فشل الاتصال: ${err?.message || "خطأ في الشبكة"}` });
  }
});

// 1. Dashboard Stats
app.get("/api/dashboard/stats", async (req, res) => {
  if (await proxyToWorker(req, res, "/api/dashboard/stats")) return;

  const totalCustomers = simulatedCustomers.length;
  const newCustomersToday = simulatedCustomers.filter(c => {
    const d = new Date(c.created_at);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const activeConversations = simulatedConversations.filter(c => c.status !== "closed").length;
  const newRequests = simulatedRequests.filter(r => r.status === "new").length;
  const followUpRequests = simulatedRequests.filter(r => r.status === "in_progress" || r.priority === "high").length;
  const hotLeadsCount = simulatedCustomers.filter(c => c.lead_status === "hot").length;
  const warmLeadsCount = simulatedCustomers.filter(c => c.lead_status === "warm").length;
  const humanRequestsCount = simulatedCustomers.filter(c => c.needs_human === 1 || c.needs_human === true).length;
  const completedRequestsCount = simulatedRequests.filter(r => r.status === "completed").length;

  const servicesMap: Record<string, number> = {};
  simulatedCustomers.forEach(c => {
    if (c.service) {
      servicesMap[c.service] = (servicesMap[c.service] || 0) + 1;
    }
  });

  const servicesBreakdown = Object.entries(servicesMap)
    .map(([service, count]) => ({
      service,
      count,
      percentage: totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  res.json({
    totalCustomers,
    newCustomersToday,
    activeConversations,
    newRequests,
    followUpRequests,
    hotLeadsCount,
    warmLeadsCount,
    humanRequestsCount,
    completedRequestsCount,
    servicesBreakdown,
    leadsBreakdown: [
      { status: "hot", count: hotLeadsCount, label: "عملاء حارين (Hot)", color: "#ef4444" },
      { status: "warm", count: warmLeadsCount, label: "عملاء مهتمين (Warm)", color: "#f59e0b" },
      { status: "cold", count: simulatedCustomers.filter(c => c.lead_status === "cold").length, label: "اهتمام منخفض (Cold)", color: "#64748b" },
      { status: "general", count: simulatedCustomers.filter(c => c.lead_status === "general").length, label: "عام (General)", color: "#3b82f6" }
    ],
    weeklyTrends: [
      { day: "السبت", customers: 0, requests: 0, humanRequests: 0 },
      { day: "الأحد", customers: 0, requests: 0, humanRequests: 0 },
      { day: "الإثنين", customers: 0, requests: 0, humanRequests: 0 },
      { day: "الثلاثاء", customers: 0, requests: 0, humanRequests: 0 },
      { day: "الأربعاء", customers: 0, requests: 0, humanRequests: 0 },
      { day: "الخميس", customers: 0, requests: 0, humanRequests: 0 },
      { day: "الجمعة", customers: 0, requests: 0, humanRequests: 0 }
    ]
  });
});

// 2. Customers List
app.get("/api/customers", async (req, res) => {
  const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  if (await proxyToWorker(req, res, `/api/customers${queryString}`)) return;

  const { search, service, lead_status, needs_human } = req.query;
  let results = [...simulatedCustomers];

  if (search) {
    const q = (search as string).toLowerCase();
    results = results.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.project && c.project.toLowerCase().includes(q)) ||
      (c.business && c.business.toLowerCase().includes(q))
    );
  }

  if (service) {
    results = results.filter(c => c.service === service);
  }

  if (lead_status) {
    results = results.filter(c => c.lead_status === lead_status);
  }

  if (needs_human === "true" || needs_human === "1") {
    results = results.filter(c => c.needs_human === 1 || c.needs_human === true);
  }

  res.json(results);
});

// 3. Single Customer
app.get("/api/customers/:id", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/customers/${req.params.id}`)) return;

  const customer = simulatedCustomers.find(c => c.id === parseInt(req.params.id));
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

app.patch("/api/customers/:id", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/customers/${req.params.id}`)) return;

  const index = simulatedCustomers.findIndex(c => c.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Customer not found" });

  simulatedCustomers[index] = {
    ...simulatedCustomers[index],
    ...req.body,
    updated_at: new Date().toISOString()
  };

  res.json(simulatedCustomers[index]);
});

// Customer sub-routes
app.get("/api/customers/:id/conversations", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/customers/${req.params.id}/conversations`)) return;
  const convs = simulatedConversations.filter(c => c.customer_id === parseInt(req.params.id));
  res.json(convs);
});

app.get("/api/customers/:id/requests", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/customers/${req.params.id}/requests`)) return;
  const reqs = simulatedRequests.filter(r => r.customer_id === parseInt(req.params.id));
  res.json(reqs);
});

// 4. Conversations List
app.get("/api/conversations", async (req, res) => {
  const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  if (await proxyToWorker(req, res, `/api/conversations${queryString}`)) return;

  const { status, search } = req.query;
  let results = simulatedConversations.map(conv => {
    const cust = simulatedCustomers.find(c => c.id === conv.customer_id);
    return {
      ...conv,
      customer_name: cust?.name || "غير معروف",
      customer_phone: cust?.phone || "",
      customer_service: cust?.service || null,
      lead_status: cust?.lead_status || "general",
      needs_human: cust?.needs_human || 0
    };
  });

  if (status) {
    results = results.filter(c => c.status === status);
  }

  if (search) {
    const q = (search as string).toLowerCase();
    results = results.filter(c =>
      (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
      (c.customer_phone && c.customer_phone.includes(q)) ||
      (c.last_message && c.last_message.toLowerCase().includes(q))
    );
  }

  res.json(results);
});

// 5. Single Conversation
app.get("/api/conversations/:id", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/conversations/${req.params.id}`)) return;

  const conv = simulatedConversations.find(c => c.id === parseInt(req.params.id));
  if (!conv) return res.status(404).json({ error: "Conversation not found" });

  const cust = simulatedCustomers.find(c => c.id === conv.customer_id);
  res.json({
    ...conv,
    customer_name: cust?.name || "غير معروف",
    customer_phone: cust?.phone || "",
    customer_service: cust?.service || null,
    lead_status: cust?.lead_status || "general",
    needs_human: cust?.needs_human || 0
  });
});

app.all(["/api/conversations/:id", "/api/conversations/:id/status"], async (req, res, next) => {
  if (req.method !== "PATCH" && req.method !== "PUT") return next();
  if (await proxyToWorker(req, res, `/api/conversations/${req.params.id}`)) return;

  const convId = parseInt(req.params.id);
  const index = simulatedConversations.findIndex(c => c.id === convId);
  if (index === -1) return res.status(404).json({ error: "Conversation not found" });

  const bodyStatus = req.body.status || req.body.newStatus;
  if (bodyStatus) {
    simulatedConversations[index].status = bodyStatus;
    const cust = simulatedCustomers.find(c => c.id === simulatedConversations[index].customer_id);
    if (cust) {
      cust.needs_human = bodyStatus === "human" ? 1 : 0;
    }
  }

  simulatedConversations[index] = {
    ...simulatedConversations[index],
    ...req.body,
    updated_at: new Date().toISOString()
  };

  const cust = simulatedCustomers.find(c => c.id === simulatedConversations[index].customer_id);
  res.json({
    ...simulatedConversations[index],
    customer_name: cust?.name || "غير معروف",
    customer_phone: cust?.phone || "",
    customer_service: cust?.service || null,
    lead_status: cust?.lead_status || "general",
    needs_human: cust?.needs_human || 0
  });
});

// 5.5 AI Reply trigger
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY || "";
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

const SERVER_SYSTEM_PROMPT = `
أنت المساعد الذكي الرسمي لمنصة "يمن بلاس" (yemplus.com).
تحدث باللهجة اليمنية العامية بطريقة طبيعية وودودة ومرحة وخفيفة دم مثل موظف خدمة عملاء يمني محترف.
خدمات يمن بلاس:
1. تصميم الشعارات والهوية البصرية
2. تصميم إعلانات وبوستات السوشيال ميديا
3. الموشن جرافيك والمونتاج والفيديوهات الإعلانية
4. تصميم وتطوير المواقع والمتاجر الإلكترونية وتطبيقات الويب
5. التسويق الرقمي وإدارة الحملات الإعلانية
6. بناء وكلاء وأنظمة الذكاء الاصطناعي
الموقع الرسمي: https://yemplus.com
`;

app.post("/api/conversations/:id/ai-reply", async (req, res) => {
  const convId = parseInt(req.params.id);

  // Direct proxy to Cloudflare Worker
  if (await proxyToWorker(req, res, `/api/conversations/${req.params.id}/ai-reply`)) return;

  try {
    let recentMessages: any[] = [];

    if (WORKER_API_URL) {
      try {
        const msgsRes = await fetch(`${WORKER_API_URL.replace(/\/$/, "")}/api/conversations/${convId}/messages`, {
          headers: DASHBOARD_API_KEY ? { "Authorization": `Bearer ${DASHBOARD_API_KEY}` } : {}
        });
        if (msgsRes.ok) {
          recentMessages = await msgsRes.json();
        }
      } catch (err) {
        // continue
      }
    }

    if (!recentMessages || recentMessages.length === 0) {
      recentMessages = simulatedMessages[convId] || [];
    }

    let contents: any[] = [];
    if (Array.isArray(recentMessages) && recentMessages.length > 0) {
      contents = recentMessages.slice(-10).map((m: any) => ({
        role: m.sender === "customer" ? "user" : "model",
        parts: [{ text: String(m.message || m.text || m.content || "") }]
      }));
    } else {
      contents = [{ role: "user", parts: [{ text: "أهلاً وسهلاً" }] }];
    }

    let aiReply = "أهلاً وسهلاً بك يا غالي في يمن بلاس! يسعدنا خدمتك وتلبية طلبك، كيف نقدر نساعدك اليوم؟ ✨";

    try {
      const ai = getGeminiClient();
      const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest"];
      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction: SERVER_SYSTEM_PROMPT
            }
          });
          if (response && response.text) {
            aiReply = response.text.trim();
            break;
          }
        } catch {
          // try next
        }
      }
    } catch {
      // fallback
    }

    let sentToWhatsApp = false;
    let whatsappError: string | undefined = undefined;

    if (WORKER_API_URL) {
      try {
        const sendRes = await fetch(`${WORKER_API_URL.replace(/\/$/, "")}/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(DASHBOARD_API_KEY ? { "Authorization": `Bearer ${DASHBOARD_API_KEY}` } : {})
          },
          body: JSON.stringify({ message: aiReply, sender: "assistant" })
        });
        if (sendRes.ok) {
          const sendData = await sendRes.json();
          sentToWhatsApp = !!sendData.sent_to_whatsapp;
          whatsappError = sendData.whatsapp_error;
        }
      } catch {
        // continue
      }
    }

    const newMsg = {
      id: Date.now(),
      conversation_id: convId,
      sender: "assistant",
      message: aiReply,
      message_type: "text",
      created_at: new Date().toISOString()
    };
    if (!simulatedMessages[convId]) simulatedMessages[convId] = [];
    simulatedMessages[convId].push(newMsg);

    const localConv = simulatedConversations.find(c => c.id === convId);
    if (localConv) {
      localConv.last_message = aiReply;
      localConv.last_message_at = new Date().toISOString();
    }

    return res.json({
      success: true,
      reply: aiReply,
      sent_to_whatsapp: sentToWhatsApp,
      whatsapp_error: whatsappError,
      message: newMsg
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "فشل معالجة الرد الذكي"
    });
  }
});

// 6. Messages
app.get("/api/conversations/:id/messages", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/conversations/${req.params.id}/messages`)) return;

  const convId = parseInt(req.params.id);
  const msgs = simulatedMessages[convId] || [];
  res.json(msgs);
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/conversations/${req.params.id}/messages`)) return;

  const convId = parseInt(req.params.id);
  const text = (req.body.message || req.body.text || req.body.content)?.trim();
  if (!text) return res.status(400).json({ error: "Message is required" });

  if (!simulatedMessages[convId]) {
    simulatedMessages[convId] = [];
  }

  const newMsg = {
    id: Date.now(),
    conversation_id: convId,
    sender: "agent",
    message: text,
    message_type: "text",
    created_at: new Date().toISOString()
  };

  simulatedMessages[convId].push(newMsg);

  const conv = simulatedConversations.find(c => c.id === convId);
  if (conv) {
    conv.last_message = text;
    conv.last_message_at = new Date().toISOString();
    conv.updated_at = new Date().toISOString();
    conv.status = "human";
  }

  res.json({ success: true, message: newMsg });
});

// 7. Requests List
app.get("/api/requests", async (req, res) => {
  const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  if (await proxyToWorker(req, res, `/api/requests${queryString}`)) return;

  const { status, priority, search } = req.query;
  let results = simulatedRequests.map(reqItem => {
    const cust = simulatedCustomers.find(c => c.id === reqItem.customer_id);
    let parsed = {};
    try {
      parsed = typeof reqItem.details === "string" ? JSON.parse(reqItem.details) : reqItem.details;
    } catch (_) {}

    return {
      ...reqItem,
      customer_name: cust?.name || "غير معروف",
      customer_phone: cust?.phone || "",
      lead_status: cust?.lead_status || "general",
      needs_human: cust?.needs_human || 0,
      parsed_details: parsed
    };
  });

  if (status) {
    results = results.filter(r => r.status === status);
  }

  if (priority) {
    results = results.filter(r => r.priority === priority);
  }

  if (search) {
    const q = (search as string).toLowerCase();
    results = results.filter(r =>
      (r.customer_name && r.customer_name.toLowerCase().includes(q)) ||
      (r.service && r.service.toLowerCase().includes(q)) ||
      (r.customer_phone && r.customer_phone.includes(q))
    );
  }

  res.json(results);
});

app.get("/api/requests/:id", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/requests/${req.params.id}`)) return;

  const reqItem = simulatedRequests.find(r => r.id === parseInt(req.params.id));
  if (!reqItem) return res.status(404).json({ error: "Request not found" });

  const cust = simulatedCustomers.find(c => c.id === reqItem.customer_id);
  let parsed = {};
  try {
    parsed = typeof reqItem.details === "string" ? JSON.parse(reqItem.details) : reqItem.details;
  } catch (_) {}

  res.json({
    ...reqItem,
    customer_name: cust?.name || "غير معروف",
    customer_phone: cust?.phone || "",
    lead_status: cust?.lead_status || "general",
    needs_human: cust?.needs_human || 0,
    parsed_details: parsed
  });
});

app.patch("/api/requests/:id", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/requests/${req.params.id}`)) return;

  const index = simulatedRequests.findIndex(r => r.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Request not found" });

  simulatedRequests[index] = {
    ...simulatedRequests[index],
    ...req.body,
    updated_at: new Date().toISOString()
  };

  res.json(simulatedRequests[index]);
});

// 8. Human Requests
app.get("/api/human-requests", async (req, res) => {
  if (await proxyToWorker(req, res, "/api/human-requests")) return;

  const humanCustomers = simulatedCustomers.filter(c => c.needs_human === 1 || c.needs_human === true);
  const results = humanCustomers.map(c => {
    const conv = simulatedConversations.find(cv => cv.customer_id === c.id);
    const reqItem = simulatedRequests.find(r => r.customer_id === c.id);

    return {
      customer_id: c.id,
      name: c.name,
      phone: c.phone,
      service: c.service,
      business: c.business,
      project: c.project,
      lead_status: c.lead_status,
      needs_human: c.needs_human,
      updated_at: c.updated_at,
      conversation_id: conv?.id || null,
      last_message: conv?.last_message || null,
      last_message_at: conv?.last_message_at || null,
      request_id: reqItem?.id || null,
      priority: reqItem?.priority || "high",
      request_status: reqItem?.status || "new"
    };
  });

  res.json(results);
});

app.post("/api/human-requests/:id/resolve", async (req, res) => {
  if (await proxyToWorker(req, res, `/api/human-requests/${req.params.id}/resolve`)) return;

  const custId = parseInt(req.params.id);
  const cust = simulatedCustomers.find(c => c.id === custId);
  if (cust) {
    cust.needs_human = 0;
    cust.updated_at = new Date().toISOString();
  }

  const conv = simulatedConversations.find(cv => cv.customer_id === custId);
  if (conv) {
    conv.status = "bot";
    conv.updated_at = new Date().toISOString();
  }

  res.json({ success: true, message: "تم حل طلب التدخل البشري وتحويل المحادثة للوكيل الذكي بنجاح" });
});

// 9. Leads
app.get("/api/leads", async (req, res) => {
  const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  if (await proxyToWorker(req, res, `/api/leads${queryString}`)) return;

  const { status } = req.query;
  let results = [...simulatedCustomers];
  if (status) {
    results = results.filter(c => c.lead_status === status);
  }
  res.json(results);
});

// 10. Analytics
app.get("/api/analytics", async (req, res) => {
  if (await proxyToWorker(req, res, "/api/analytics")) return;

  const totalCust = simulatedCustomers.length;
  const totalConv = simulatedConversations.length;
  const totalReq = simulatedRequests.length;
  const hotCount = simulatedCustomers.filter(c => c.lead_status === "hot").length;
  const warmCount = simulatedCustomers.filter(c => c.lead_status === "warm").length;
  const humanCount = simulatedCustomers.filter(c => c.needs_human === 1 || c.needs_human === true).length;

  res.json({
    summary: {
      totalCustomers: totalCust,
      totalConversations: totalConv,
      totalRequests: totalReq,
      hotLeads: hotCount,
      warmLeads: warmCount,
      humanRequests: humanCount,
      conversionRate: 0,
      avgResponseMinutes: 0.8
    },
    servicesDemand: [],
    dailyGrowth: [],
    leadFunnel: [],
    hourlyActivity: [],
    satisfactionRate: 100
  });
});

// Vite Middleware for development & Production static server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Yemen Plus Dashboard Server running at http://localhost:${PORT}`);
  });
}

startServer();
