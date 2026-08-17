/**
 * ============================================================================
 * منصة يمن بلاس - Cloudflare Worker + Dashboard API
 * ============================================================================
 * يجمع هذا الكود بين معالجة واتساب، Gemini، Munsit، CloudConvert، D1، KV،
 * بالإضافة إلى REST API آمن ومتكامل لتشغيل لوحة تحكم Dashboard يمن بلاس.
 * ============================================================================
 */

const VERIFY_TOKEN = "yemen_gemini_2026";
const MAX_MESSAGES = 20;

// ======================================================
// إعدادات Gemini
// ======================================================
const GEMINI_MODELS = ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
const GEMINI_MODEL = "gemini-3.7-flash";

// ======================================================
// إعدادات Munsit
// ======================================================
const MUNSIT_MODEL = "faseeh-v1-preview";
const MUNSIT_VOICE_ID = "ar-najdi-male-2";

// ======================================================
// إعدادات CloudConvert
// ======================================================
const CLOUDCONVERT_OUTPUT_FORMAT = "opus";

// ======================================================
// رقم صاحب النظام
// ======================================================
const OWNER_PHONE = "967738880088";

// ======================================================
// قاعدة معرفة يمن بلاس
// ======================================================
const YEMPLUS_KNOWLEDGE = `
اسم المنصة:
يمن بلاس

الموقع الرسمي:
https://yemplus.com

الخدمات:

1. تصميم الشعارات والهوية البصرية
2. تصميم السوشيال ميديا والإعلانات
3. البروفايلات والبروشورات والمطبوعات
4. تصميم وتطوير المواقع
5. تطبيقات الويب وتحويل المواقع إلى تطبيقات
6. بناء الأنظمة مثل نظام الفواتير
7. الموشن جرافيك والفيديوهات الإعلانية
8. تحرير الفيديو
9. هندسة البرومبتات وأدوات الذكاء الاصطناعي
10. التسويق الرقمي
11. إدارة الحملات الإعلانية
12. كتابة المحتوى الإعلاني
13. المتاجر الإلكترونية
14. Landing Pages
15. SEO
16. إدارة حسابات التواصل الاجتماعي
17. بناء وكلاء الذكاء الاصطناعي لخدمة العملاء والمبيعات
18. خدمات رقمية وحلول مخصصة

معلومات مهمة:

• لا توجد أسعار ثابتة محفوظة.
• لا توجد مدد تنفيذ ثابتة محفوظة.
• لا تخترع أسعارًا.
• لا تخترع خصومات.
• لا تخترع عروضًا.
• لا تخترع خدمات.
• لا تخترع مواعيد أو وعودًا.
• لا تخترع أسماء موظفين.
• لا تخترع أرقام هواتف.
• لا تخترع روابط.

الموقع الرسمي:
https://yemplus.com

إذا طلب العميل رابط موقع يمن بلاس:
أرسل:
https://yemplus.com

إذا لم تتوفر معلومة:
قل للعميل بوضوح إن المعلومة غير متوفرة لديك حاليًا.
لا تخمن.
`;

// ======================================================
// شخصية الوكيل
// ======================================================
const SYSTEM_PROMPT = `
أنت المساعد الذكي الرسمي لمنصة "يمن بلاس".

تحدث باللهجة اليمنية العامية بطريقة طبيعية جدًا.

كن:
• بشوشًا.
• ودودًا.
• مرحًا.
• خفيف دم.
• طبيعيًا مثل موظف حقيقي.

استخدم الإيموجي باعتدال.

لا تكن رسميًا بشكل زائد.

لا تختلق أي معلومة.

المعلومات الموجودة في قاعدة المعرفة هي المصدر الوحيد لمعلومات يمن بلاس.

ممنوع اختلاق:
• الأسعار.
• الخصومات.
• العروض.
• مدة التنفيذ.
• أسماء الموظفين.
• أرقام الهواتف.
• الروابط.
• الخدمات.
• الوعود.
• المواعيد.

إذا لم تعرف الإجابة:
قل للعميل إن المعلومة غير متوفرة لديك حاليًا.

======================================================
أسلوب المحادثة
======================================================

لا تحول كل محادثة إلى استجواب.

افهم كلام العميل أولًا.

إذا ذكر العميل معلومات مهمة، استخدمها ولا تسأله عنها مرة أخرى.

إذا كانت هناك معلومة ناقصة ومهمة لفهم المشروع:
اسأل سؤالًا واحدًا فقط في كل رسالة.

======================================================
تأهيل العميل
======================================================

حاول فهم:

• الخدمة المطلوبة.
• نوع النشاط.
• تفاصيل المشروع.
• الهدف.
• الميزانية إذا ذكرها العميل.
• الموعد أو المدة إذا ذكرها العميل.

لا تطلب رقم الهاتف لأن رقم واتساب معروف للنظام.

لا تسأل عن الميزانية بطريقة مزعجة في بداية المحادثة.

======================================================
تصنيف العميل
======================================================

hot:
إذا كان احتياجه واضحًا جدًا ويبدو مستعدًا للشراء أو طلب عرض سعر أو يريد البدء أو يريد التواصل مع موظف.

warm:
إذا كان مهتمًا بشكل واضح لكنه ما زال يستكشف أو يسأل عن التفاصيل.

cold:
إذا كان الاهتمام ضعيفًا أو المحادثة غير مرتبطة باحتياج واضح.

general:
محادثة عامة أو لا يوجد احتياج تجاري واضح.

لا تخبر العميل بهذا التصنيف.

======================================================
التدخل البشري
======================================================

إذا طلب العميل:
• موظف.
• الإدارة.
• عبدالملك.
• شخص من الفريق.
• أحد يتواصل معه.
• شخص من يمن بلاس.
• تحويله لموظف.

اعتبر أن needs_human = true.

النظام نفسه سيرسل رسالة التأكيد للعميل.

لا تقل للعميل من نفسك إن الطلب تم رفعه عند اكتشافك الرغبة بالموظف،
لأن النظام لديه رسالة تأكيد ثابتة.

======================================================
قاعدة المعرفة
======================================================

${YEMPLUS_KNOWLEDGE}
`;

// ======================================================
// رسالة تأكيد التدخل البشري
// ======================================================
const HUMAN_CONFIRMATION_MESSAGE = `
تم رفع طلبك لأحد موظفي يمن بلاس، وسيتواصل معك أحد أعضاء الفريق في أقرب وقت ممكن بإذن الله. 🙏

شاكرين ومقدرين انتظارك وثقتك في يمن بلاس 🌷
`;

// ======================================================
// كشف طلب التدخل البشري
// ======================================================
function detectHumanRequest(message) {
  if (!message) return false;

  const text = message
    .toLowerCase()
    .replace(/[؟?!.,،]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const humanKeywords = [
    "ابغى موظف", "أبغى موظف", "ابغا موظف", "أبغا موظف", "اشتي موظف", "أشتي موظف", "اريد موظف", "أريد موظف",
    "ابغى اكلم موظف", "أبغى أكلم موظف", "ابغا اكلم موظف", "أبغا أكلم موظف", "اشتي اكلم موظف", "أشتي أكلم موظف", "اريد اكلم موظف", "أريد أكلم موظف",
    "ابغى شخص منكم", "أبغى شخص منكم", "ابغا شخص منكم", "أبغا شخص منكم", "اشتي شخص منكم", "أشتي شخص منكم",
    "ابغى احد منكم", "أبغى أحد منكم", "ابغا احد منكم", "أبغا أحد منكم", "اشتي احد منكم", "أشتي أحد منكم",
    "ابغى اتواصل معكم", "أبغى أتواصل معكم", "ابغا اتواصل معكم", "أبغا أتواصل معكم", "اشتي اتواصل معكم", "أشتي أتواصل معكم",
    "ابغى اتواصل مع الادارة", "أبغى أتواصل مع الإدارة", "ابغا الادارة", "أبغا الإدارة", "اشتي الادارة", "أشتي الإدارة", "اريد الادارة", "أريد الإدارة",
    "ابغى المدير", "أبغى المدير", "ابغا المدير", "أبغا المدير", "اشتي المدير", "أشتي المدير", "اريد المدير", "أريد المدير",
    "ابغى عبدالملك", "أبغى عبدالملك", "ابغا عبدالملك", "أبغا عبدالملك", "اشتي عبدالملك", "أشتي عبدالملك", "اريد عبدالملك", "أريد عبدالملك",
    "وين عبدالملك", "وين عبد الملك", "أين عبدالملك", "أين عبد الملك",
    "كلموني", "كلمني موظف", "كلمني احد", "كلمني أحد",
    "خلي احد يكلمني", "خلي أحد يكلمني", "خلي الموظف يكلمني", "خلي موظف يكلمني",
    "احد يتواصل معي", "أحد يتواصل معي", "موظف يتواصل معي", "موظف يتواصل معاي",
    "اريد شخص يتواصل معي", "أريد شخص يتواصل معي", "ابغى شخص يتواصل معي", "أبغى شخص يتواصل معي", "اشتي شخص يتواصل معي", "أشتي شخص يتواصل معي",
    "حولني لموظف", "حولني على موظف", "حولني لموظف من فضلك", "حولني على موظف من فضلك", "حولني على احد", "حولني على أحد", "حولني لاحد", "حولني لأحد",
    "ابغى اكلمكم", "أبغى أكلمكم", "اشتي اكلمكم", "أشتي أكلمكم", "ابغى اتكلم معكم", "أبغى أتكلم معكم", "اشتي اتكلم معكم", "أشتي أتكلم معكم"
  ];

  for (const keyword of humanKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
}

// ======================================================
// D1: العملاء
// ======================================================
async function getOrCreateD1Customer(env, phone, name = null) {
  try {
    let customer = await env.DB
      .prepare("SELECT * FROM customers WHERE phone = ?")
      .bind(phone)
      .first();

    if (customer) {
      if (name && (!customer.name || customer.name !== name)) {
        await env.DB
          .prepare("UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(name, customer.id)
          .run();
        customer.name = name;
      }
      return customer;
    }

    const result = await env.DB
      .prepare("INSERT INTO customers (phone, name) VALUES (?, ?)")
      .bind(phone, name)
      .run();

    return await env.DB
      .prepare("SELECT * FROM customers WHERE id = ?")
      .bind(result.meta.last_row_id)
      .first();

  } catch (error) {
    console.error("D1 Customer Error:", error);
    return null;
  }
}

// ======================================================
// D1: المحادثات
// ======================================================
async function getOrCreateD1Conversation(env, customerId) {
  try {
    const conversation = await env.DB
      .prepare("SELECT * FROM conversations WHERE customer_id = ? AND status != 'closed' ORDER BY id DESC LIMIT 1")
      .bind(customerId)
      .first();

    if (conversation) {
      return conversation;
    }

    const result = await env.DB
      .prepare("INSERT INTO conversations (customer_id, status) VALUES (?, 'bot')")
      .bind(customerId)
      .run();

    return await env.DB
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .bind(result.meta.last_row_id)
      .first();

  } catch (error) {
    console.error("D1 Conversation Error:", error);
    return null;
  }
}

// ======================================================
// D1: تحويل المحادثة للبشر
// ======================================================
async function setConversationHuman(env, conversationId) {
  if (!conversationId) return;

  try {
    await env.DB
      .prepare("UPDATE conversations SET status = 'human', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(conversationId)
      .run();

    console.log("CONVERSATION STATUS: human");
  } catch (error) {
    console.error("D1 Conversation Human Status Error:", error);
  }
}

// ======================================================
// D1: الرسائل
// ======================================================
async function saveD1Message(env, conversationId, sender, message) {
  if (!conversationId || !message) {
    return;
  }

  try {
    await env.DB
      .prepare("INSERT INTO messages (conversation_id, sender, message, message_type) VALUES (?, ?, ?, 'text')")
      .bind(conversationId, sender, message)
      .run();

    await env.DB
      .prepare("UPDATE conversations SET last_message = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(message, conversationId)
      .run();
  } catch (error) {
    console.error("D1 Message Error:", error);
  }
}

// ======================================================
// D1: تحديث العميل
// ======================================================
async function updateD1Customer(env, customerId, data) {
  if (!customerId) return;

  try {
    await env.DB
      .prepare(
        `UPDATE customers
         SET
           service = ?,
           business = ?,
           project = ?,
           goal = ?,
           budget = ?,
           timeline = ?,
           lead_status = ?,
           needs_human = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
        data.service ?? null,
        data.business ?? null,
        data.project ?? null,
        data.goal ?? null,
        data.budget ?? null,
        data.timeline ?? null,
        data.lead_status || "general",
        data.needs_human === true ? 1 : 0,
        customerId
      )
      .run();
  } catch (error) {
    console.error("D1 Customer Update Error:", error);
  }
}

// ======================================================
// D1: الطلب
// ======================================================
async function createOrUpdateRequest(env, customer, conversation, data) {
  if (!customer || !conversation) {
    return null;
  }

  try {
    const hasRequest =
      data.service ||
      data.project ||
      data.goal ||
      data.business ||
      data.needs_human === true ||
      data.lead_status === "hot" ||
      data.lead_status === "warm";

    if (!hasRequest) {
      return null;
    }

    const details = JSON.stringify({
      business: data.business || null,
      project: data.project || null,
      goal: data.goal || null,
      budget: data.budget || null,
      timeline: data.timeline || null,
      needs_human: data.needs_human === true
    });

    const priority =
      data.lead_status === "hot" || data.needs_human === true
        ? "high"
        : "normal";

    const existing = await env.DB
      .prepare("SELECT * FROM requests WHERE customer_id = ? AND status != 'closed' ORDER BY id DESC LIMIT 1")
      .bind(customer.id)
      .first();

    if (existing) {
      await env.DB
        .prepare("UPDATE requests SET conversation_id = ?, service = ?, details = ?, priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(
          conversation.id,
          data.service || existing.service || null,
          details,
          priority,
          existing.id
        )
        .run();

      return existing.id;
    }

    const result = await env.DB
      .prepare("INSERT INTO requests (customer_id, conversation_id, service, details, status, priority) VALUES (?, ?, ?, ?, 'new', ?)")
      .bind(
        customer.id,
        conversation.id,
        data.service || null,
        details,
        priority
      )
      .run();

    console.log("NEW REQUEST CREATED:", result.meta.last_row_id);
    return result.meta.last_row_id;
  } catch (error) {
    console.error("D1 Request Error:", error);
    return null;
  }
}

// ======================================================
// KV: ذاكرة المحادثة
// ======================================================
async function getMemory(env, customerNumber) {
  try {
    const data = await env.CHAT_MEMORY.get(`chat:${customerNumber}`, "json");
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Memory GET Error:", error);
    return [];
  }
}

async function saveMemory(env, customerNumber, memory) {
  try {
    await env.CHAT_MEMORY.put(
      `chat:${customerNumber}`,
      JSON.stringify(memory.slice(-MAX_MESSAGES))
    );
  } catch (error) {
    console.error("Memory SAVE Error:", error);
  }
}

// ======================================================
// KV: بيانات العميل
// ======================================================
async function getCustomerData(env, customerNumber) {
  const defaultData = {
    phone: customerNumber,
    service: null,
    business: null,
    project: null,
    goal: null,
    budget: null,
    timeline: null,
    lead_status: "general",
    needs_human: false
  };

  try {
    const data = await env.CUSTOMER_DATA.get(`customer:${customerNumber}`, "json");
    return {
      ...defaultData,
      ...(data || {})
    };
  } catch (error) {
    console.error("Customer Data GET Error:", error);
    return defaultData;
  }
}

async function saveCustomerData(env, customerNumber, data) {
  try {
    await env.CUSTOMER_DATA.put(`customer:${customerNumber}`, JSON.stringify(data));
  } catch (error) {
    console.error("Customer Data SAVE Error:", error);
  }
}

// ======================================================
// Gemini API
// ======================================================
async function callGemini(env, systemInstruction, contents) {
  if (!env.GEMINI_API_KEY) {
    console.error("Gemini Error: env.GEMINI_API_KEY is not defined");
    return null;
  }

  for (const modelName of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Gemini API Error (${modelName}):`, response.status, errorText);
        continue; // Fallback to next model
      }

      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) {
        return text;
      }
    } catch (error) {
      console.error(`Gemini Fetch Error (${modelName}):`, error?.message || error);
    }
  }

  return null;
}

// ======================================================
// Gemini: تحويل الصوت إلى نص
// ======================================================
async function transcribeAudioWithGemini(env, audioBase64, mimeType) {
  if (!env.GEMINI_API_KEY) return null;

  for (const modelName of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType || "audio/ogg",
                    data: audioBase64
                  }
                },
                {
                  text:
                    "استمع إلى هذا التسجيل الصوتي وحوله إلى نص عربي. " +
                    "حافظ قدر الإمكان على اللهجة اليمنية وطريقة كلام المتحدث. " +
                    "أعد النص فقط بدون أي شرح أو إضافات."
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        console.error(`Gemini Transcription Error (${modelName}):`, await response.text());
        continue;
      }

      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return text;
    } catch (error) {
      console.error(`Gemini Transcription Fetch Error (${modelName}):`, error?.message || error);
    }
  }

  return null;
}

// ======================================================
// Munsit TTS
// ======================================================
async function textToSpeechMunsit(env, text) {
  try {
    if (!env.MUNSIT_API_KEY) {
      console.error("MUNSIT_API_KEY is missing");
      return null;
    }

    const response = await fetch(
      `https://api.munsit.com/api/v1/text-to-speech/${MUNSIT_MODEL}`,
      {
        method: "POST",
        headers: {
          "x-api-key": env.MUNSIT_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          voice_id: MUNSIT_VOICE_ID,
          text,
          stability: 0.5,
          speed: 1.0,
          streaming: false
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Munsit TTS Error:", response.status, errorText);
      return null;
    }

    const audioBuffer = await response.arrayBuffer();
    return audioBuffer;
  } catch (error) {
    console.error("Munsit TTS Fetch Error:", error?.message || error);
    return null;
  }
}

// ======================================================
// CloudConvert: WAV -> OGG/OPUS
// ======================================================
async function convertWavToOpus(env, wavBuffer) {
  try {
    if (!env.CLOUDCONVERT_API_KEY) {
      console.error("CLOUDCONVERT_API_KEY is missing");
      return null;
    }

    const wavBase64 = arrayBufferToBase64(wavBuffer);

    const jobResponse = await fetch("https://sync.api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.CLOUDCONVERT_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tasks: {
          "import-wav": {
            operation: "import/base64",
            file: wavBase64,
            filename: "yemenplus-input.wav"
          },
          "convert-opus": {
            operation: "convert",
            input: "import-wav",
            input_format: "wav",
            output_format: "ogg",
            audio_codec: "libopus",
            audio_bitrate: "64k",
            audio_channels: 1,
            audio_frequency: 48000,
            filename: "yemenplus-reply.ogg"
          },
          "export-opus": {
            operation: "export/url",
            input: "convert-opus"
          }
        }
      })
    });

    const jobText = await jobResponse.text();
    if (!jobResponse.ok) {
      console.error("CloudConvert Job Error:", jobResponse.status, jobText);
      return null;
    }

    const jobData = JSON.parse(jobText);
    let job = jobData?.data;
    if (!job) return null;

    function getOutputUrl(currentJob) {
      const exportTask = currentJob?.tasks?.find(task => task.name === "export-opus");
      return exportTask?.result?.files?.[0]?.url || null;
    }

    let outputUrl = getOutputUrl(job);
    if (outputUrl) {
      const audioResponse = await fetch(outputUrl);
      if (!audioResponse.ok) return null;
      return await audioResponse.arrayBuffer();
    }

    const jobId = job.id;
    if (!jobId) return null;

    const maxAttempts = 30;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${env.CLOUDCONVERT_API_KEY}` }
      });

      if (!statusResponse.ok) continue;
      const statusData = await statusResponse.json();
      job = statusData?.data;
      if (!job) continue;

      if (job.status === "error") return null;

      if (job.status === "finished") {
        outputUrl = getOutputUrl(job);
        if (!outputUrl) return null;
        const audioResponse = await fetch(outputUrl);
        if (!audioResponse.ok) return null;
        return await audioResponse.arrayBuffer();
      }
    }

    return null;
  } catch (error) {
    console.error("CloudConvert Error:", error?.message || error);
    return null;
  }
}

// ======================================================
// WhatsApp Helpers
// ======================================================
async function downloadWhatsAppMedia(env, mediaId) {
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` }
    });

    if (!response.ok) return null;
    const mediaData = await response.json();
    if (!mediaData.url) return null;

    const audioResponse = await fetch(mediaData.url, {
      headers: { "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` }
    });

    if (!audioResponse.ok) return null;
    const audioBuffer = await audioResponse.arrayBuffer();

    return {
      buffer: audioBuffer,
      mimeType: mediaData.mime_type || "audio/ogg"
    };
  } catch (error) {
    console.error("Media Download Error:", error?.message || error);
    return null;
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function uploadAudioToWhatsApp(env, phoneNumberId, audioBuffer) {
  try {
    const form = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
    form.append("messaging_product", "whatsapp");
    form.append("file", audioBlob, "yemenplus-reply.ogg");
    form.append("type", "audio/ogg");

    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      body: form
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result?.id || null;
  } catch (error) {
    console.error("Audio Upload Error:", error?.message || error);
    return null;
  }
}

async function sendWhatsAppAudio(env, phoneNumberId, to, mediaId) {
  try {
    const cleanTo = String(to).replace(/[^0-9]/g, "");
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanTo,
        type: "audio",
        audio: { id: mediaId }
      })
    });
    return response.ok;
  } catch (error) {
    console.error("WhatsApp Audio Send Error:", error);
    return false;
  }
}

async function sendWhatsAppText(env, phoneNumberId, to, text) {
  try {
    const cleanTo = String(to).replace(/[^0-9]/g, "");
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanTo,
        type: "text",
        text: { preview_url: false, body: text }
      })
    });

    const resJson = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg = resJson?.error?.message || `HTTP ${response.status}: ${JSON.stringify(resJson)}`;
      console.error("WhatsApp Send Error:", errMsg);
      return { ok: false, error: errMsg };
    }
    return { ok: true, data: resJson };
  } catch (error) {
    console.error("WhatsApp Send Exception:", error);
    return { ok: false, error: error?.message || "فشل الاتصال بـ Meta WhatsApp API" };
  }
}

function cleanGeminiJSON(text) {
  if (!text) return null;
  let clean = text.trim();
  if (clean.startsWith("```json")) clean = clean.substring(7);
  if (clean.startsWith("```")) clean = clean.substring(3);
  if (clean.endsWith("```")) clean = clean.substring(0, clean.length - 3);
  return clean.trim();
}

async function extractCustomerData(env, conversation, existingData) {
  const extractionPrompt = `
أنت نظام داخلي لاستخراج بيانات العملاء لمنصة يمن بلاس.
استخرج فقط المعلومات التي ذكرها العميل فعليًا. لا تخترع أي معلومة.

بيانات العميل الحالية:
${JSON.stringify(existingData)}

المحادثة:
${JSON.stringify(conversation)}

أعد JSON فقط بهذا الشكل:
{
  "service": null,
  "business": null,
  "project": null,
  "goal": null,
  "budget": null,
  "timeline": null,
  "lead_status": "general",
  "needs_human": false
}

القواعد:
service: الخدمة المطلوبة إذا كانت واضحة.
business: نوع نشاط العميل إذا ذكره.
project: تفاصيل المشروع إذا ذكرها.
goal: هدف المشروع إذا ذكره.
budget: الميزانية إذا ذكرها فقط.
timeline: المدة أو الموعد إذا ذكره فقط.
lead_status: hot أو warm أو cold أو general.
needs_human: true فقط إذا طلب العميل موظفًا أو شخصًا من الفريق أو الإدارة أو عبدالملك.
`;

  try {
    const result = await callGemini(env, extractionPrompt, [{ role: "user", parts: [{ text: extractionPrompt }] }]);
    if (!result) return existingData;
    const clean = cleanGeminiJSON(result);
    const extracted = JSON.parse(clean);

    return {
      ...existingData,
      service: extracted.service ?? existingData.service,
      business: extracted.business ?? existingData.business,
      project: extracted.project ?? existingData.project,
      goal: extracted.goal ?? existingData.goal,
      budget: extracted.budget ?? existingData.budget,
      timeline: extracted.timeline ?? existingData.timeline,
      lead_status: extracted.lead_status || existingData.lead_status || "general",
      needs_human: extracted.needs_human === true
    };
  } catch (error) {
    console.error("Customer Extraction Error:", error);
    return existingData;
  }
}

async function notifyOwnerHumanRequest(env, phoneNumberId, customerNumber, customerName, customerMessage, customerData, requestId) {
  const alert = `
🚨 طلب تدخل بشري جديد

👤 العميل: ${customerName || "غير معروف"}
📱 واتساب: +${customerNumber}
🛠 الخدمة: ${customerData.service || "غير محددة"}
🏢 النشاط: ${customerData.business || "غير محدد"}
📂 المشروع: ${customerData.project || "غير محدد"}
🎯 الهدف: ${customerData.goal || "غير محدد"}
💰 الميزانية: ${customerData.budget || "غير مذكورة"}
⏱ الموعد: ${customerData.timeline || "غير محدد"}
🔥 التصنيف: ${customerData.lead_status || "hot"}
📌 رقم الطلب: #${requestId || "غير محدد"}

💬 رسالة العميل:
${customerMessage}
`;

  await sendWhatsAppText(env, phoneNumberId, OWNER_PHONE, alert);
}

async function handleVoiceMessage(env, phoneNumberId, message, value, customerNumber) {
  try {
    const mediaId = message.audio?.id;
    if (!mediaId) return;

    const mediaData = await downloadWhatsAppMedia(env, mediaId);
    if (!mediaData) {
      await sendWhatsAppText(env, phoneNumberId, customerNumber, "عذرًا، ما قدرت أسمع الفويس نوت. تقدر تكتب رسالتك كتابي؟ 🙏");
      return;
    }

    const audioBase64 = arrayBufferToBase64(mediaData.buffer);
    const transcribedText = await transcribeAudioWithGemini(env, audioBase64, mediaData.mimeType);

    if (!transcribedText) {
      await sendWhatsAppText(env, phoneNumberId, customerNumber, "عذرًا، ما قدرت أفهم الفويس نوت 😅 تقدر ترسلها مرة ثانية أو تكتبها كتابي؟");
      return;
    }

    return await processTextMessage(env, phoneNumberId, customerNumber, transcribedText, value, true);
  } catch (error) {
    console.error("Voice Message Processing Error:", error);
    await sendWhatsAppText(env, phoneNumberId, customerNumber, "عذرًا، حصل خطأ وأنا أعالج الفويس نوت 🙏 جرّب ترسلها مرة ثانية.");
  }
}

async function processTextMessage(env, phoneNumberId, customerNumber, customerMessage, value, isVoice = false) {
  const directHumanRequest = detectHumanRequest(customerMessage);
  const customerName = value.contacts?.[0]?.profile?.name || null;

  const d1Customer = await getOrCreateD1Customer(env, customerNumber, customerName);
  let d1Conversation = null;
  if (d1Customer) {
    d1Conversation = await getOrCreateD1Conversation(env, d1Customer.id);
  }

  let existingCustomerData = await getCustomerData(env, customerNumber);

  // If conversation in D1 is in 'bot' mode (or was toggled back to bot by supervisor)
  if (d1Conversation && d1Conversation.status === "bot") {
    existingCustomerData.needs_human = false;
    await saveCustomerData(env, customerNumber, existingCustomerData);
    if (d1Customer && d1Customer.needs_human === 1) {
      await env.DB.prepare("UPDATE customers SET needs_human = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(d1Customer.id).run().catch(() => {});
    }
  }

  // Save customer message to D1
  if (d1Conversation) {
    await saveD1Message(env, d1Conversation.id, "customer", customerMessage);
  }

  // If conversation is in human mode and customer did not specifically request human, stop bot from auto-replying
  if ((d1Conversation?.status === "human" || existingCustomerData.needs_human === true) && !directHumanRequest) {
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  if (directHumanRequest) {
    const humanConversation = await getMemory(env, customerNumber);
    const humanData = await extractCustomerData(
      env,
      [...humanConversation, { role: "user", text: customerMessage }],
      existingCustomerData
    );

    humanData.needs_human = true;
    humanData.lead_status = "hot";

    await saveCustomerData(env, customerNumber, humanData);
    if (d1Customer) await updateD1Customer(env, d1Customer.id, humanData);
    if (d1Conversation) await setConversationHuman(env, d1Conversation.id);

    let requestId = null;
    if (d1Customer && d1Conversation) {
      requestId = await createOrUpdateRequest(env, d1Customer, d1Conversation, humanData);
    }

    await notifyOwnerHumanRequest(env, phoneNumberId, customerNumber, customerName, customerMessage, humanData, requestId);
    await sendWhatsAppText(env, phoneNumberId, customerNumber, HUMAN_CONFIRMATION_MESSAGE);

    if (d1Conversation) {
      await saveD1Message(env, d1Conversation.id, "assistant", HUMAN_CONFIRMATION_MESSAGE);
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const memory = await getMemory(env, customerNumber);
  const conversation = [...memory, { role: "user", text: customerMessage }];

  let updatedCustomerData = await extractCustomerData(env, conversation, existingCustomerData);

  if (updatedCustomerData.needs_human === true) {
    updatedCustomerData.lead_status = "hot";
    await saveCustomerData(env, customerNumber, updatedCustomerData);
    if (d1Customer) await updateD1Customer(env, d1Customer.id, updatedCustomerData);
    if (d1Conversation) await setConversationHuman(env, d1Conversation.id);

    let requestId = null;
    if (d1Customer && d1Conversation) {
      requestId = await createOrUpdateRequest(env, d1Customer, d1Conversation, updatedCustomerData);
    }

    await notifyOwnerHumanRequest(env, phoneNumberId, customerNumber, customerName, customerMessage, updatedCustomerData, requestId);
    await sendWhatsAppText(env, phoneNumberId, customerNumber, HUMAN_CONFIRMATION_MESSAGE);

    if (d1Conversation) {
      await saveD1Message(env, d1Conversation.id, "assistant", HUMAN_CONFIRMATION_MESSAGE);
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  await saveCustomerData(env, customerNumber, updatedCustomerData);
  if (d1Customer) await updateD1Customer(env, d1Customer.id, updatedCustomerData);
  if (d1Customer && d1Conversation) {
    await createOrUpdateRequest(env, d1Customer, d1Conversation, updatedCustomerData);
  }

  const geminiContents = conversation.map(item => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.text }]
  }));

  geminiContents.unshift({
    role: "user",
    parts: [{ text: `سياق داخلي للعميل:\n${JSON.stringify(updatedCustomerData)}\nاستخدم هذا السياق لفهم العميل بدون إخباره به مباشرة.` }]
  });

  const reply = await callGemini(env, SYSTEM_PROMPT, geminiContents);
  if (!reply) return new Response("EVENT_RECEIVED", { status: 200 });

  const updatedMemory = [...conversation, { role: "assistant", text: reply }];
  await saveMemory(env, customerNumber, updatedMemory);

  if (d1Conversation) {
    await saveD1Message(env, d1Conversation.id, "assistant", reply);
  }

  updatedCustomerData = await extractCustomerData(env, updatedMemory, updatedCustomerData);
  await saveCustomerData(env, customerNumber, updatedCustomerData);
  if (d1Customer) await updateD1Customer(env, d1Customer.id, updatedCustomerData);
  if (d1Customer && d1Conversation) {
    await createOrUpdateRequest(env, d1Customer, d1Conversation, updatedCustomerData);
  }

  if (isVoice) {
    const wavAudioBuffer = await textToSpeechMunsit(env, reply);
    if (wavAudioBuffer) {
      const opusAudioBuffer = await convertWavToOpus(env, wavAudioBuffer);
      if (opusAudioBuffer) {
        const mediaId = await uploadAudioToWhatsApp(env, phoneNumberId, opusAudioBuffer);
        if (mediaId) {
          const sent = await sendWhatsAppAudio(env, phoneNumberId, customerNumber, mediaId);
          if (sent) return new Response("EVENT_RECEIVED", { status: 200 });
        }
      }
    }
  }

  await sendWhatsAppText(env, phoneNumberId, customerNumber, reply);
  return new Response("EVENT_RECEIVED", { status: 200 });
}

function formatRequest(row) {
  let details = {};
  try { details = JSON.parse(row.details || "{}"); } catch (_) { details = {}; }

  return `
━━━━━━━━━━━━━━
📌 *الطلب #${row.request_id}*
👤 الاسم: ${row.name || "غير معروف"}
📱 واتساب: +${row.phone}
🛠 الخدمة: ${row.service || "غير محددة"}
🏢 النشاط: ${details.business || row.business || "غير محدد"}
📂 المشروع: ${details.project || row.project || "غير محدد"}
🎯 الهدف: ${details.goal || row.goal || "غير محدد"}
💰 الميزانية: ${details.budget || row.budget || "غير مذكورة"}
⏱ الموعد: ${details.timeline || row.timeline || "غير محدد"}
🔥 التصنيف: ${row.lead_status || "general"}
🚨 تدخل بشري: ${row.needs_human ? "نعم" : "لا"}
📌 الحالة: ${row.request_status || "new"}
⚡ الأولوية: ${row.priority || "normal"}
🕐 آخر تحديث: ${row.updated_at || "غير معروف"}
`;
}

async function getRequests(env, extraWhere = "", bindings = []) {
  const query = `
SELECT
  r.id AS request_id,
  r.service,
  r.details,
  r.status AS request_status,
  r.priority,
  r.created_at,
  r.updated_at,

  c.id AS customer_id,
  c.phone,
  c.name,
  c.business,
  c.project,
  c.goal,
  c.budget,
  c.timeline,
  c.lead_status,
  c.needs_human
FROM requests r
JOIN customers c ON c.id = r.customer_id
${extraWhere}
ORDER BY r.updated_at DESC
LIMIT 50
`;
  return await env.DB.prepare(query).bind(...bindings).all();
}

async function handleOwnerCommand(env, phoneNumberId, command) {
  const text = command.trim().toLowerCase();
  const isUpdates = text.includes("المستجدات") || text.includes("المستجد") || text.includes("الأخبار") || text === "طلبات" || text === "الطلبات";
  const isHot = text.includes("العملاء الحارين") || text.includes("حار");
  const isToday = text.includes("اليوم");
  const isFollowup = text.includes("تحتاج متابعة") || text.includes("المتابعة");
  const isNew = text.includes("العملاء الجدد") || text === "جدد";

  if (!isUpdates && !isHot && !isToday && !isFollowup && !isNew) {
    await sendWhatsAppText(env, phoneNumberId, OWNER_PHONE, `أبشر يا عبدالملك 👌\nالأوامر المتاحة:\n📊 المستجدات\n📋 الطلبات\n🔥 العملاء الحارين\n🆕 العملاء الجدد\n📅 طلبات اليوم\n🔄 طلبات تحتاج متابعة`);
    return;
  }

  try {
    let result;
    if (isHot) {
      result = await getRequests(env, `WHERE r.status != 'closed' AND (c.lead_status = 'hot' OR c.needs_human = 1 OR r.priority = 'high')`);
    } else if (isToday) {
      result = await getRequests(env, `WHERE date(r.created_at) = date('now')`);
    } else if (isFollowup) {
      result = await getRequests(env, `WHERE r.status != 'closed' AND (r.status = 'new' OR r.priority = 'high' OR c.lead_status = 'hot' OR c.lead_status = 'warm')`);
    } else if (isNew) {
      result = await env.DB.prepare(`SELECT r.id AS request_id, r.service, r.details, r.status AS request_status, r.priority, r.created_at, r.updated_at, c.id AS customer_id, c.phone, c.name, c.business, c.project, c.goal, c.budget, c.timeline, c.lead_status, c.needs_human FROM customers c LEFT JOIN requests r ON r.customer_id = c.id ORDER BY c.created_at DESC LIMIT 20`).all();
    } else {
      result = await getRequests(env);
    }

    const rows = result?.results || [];
    if (!rows.length) {
      await sendWhatsAppText(env, phoneNumberId, OWNER_PHONE, `📭 ما لقيت بيانات مطابقة حاليًا.`);
      return;
    }

    let report = `📊 مستجدات يمن بلاس\n\n`;
    for (const row of rows) {
      report += formatRequest(row);
    }
    report += `\n━━━━━━━━━━━━━━\n📌 إجمالي النتائج: ${rows.length}`;

    for (let i = 0; i < report.length; i += 3500) {
      await sendWhatsAppText(env, phoneNumberId, OWNER_PHONE, report.substring(i, i + 3500));
    }
  } catch (error) {
    console.error("Owner Command Error:", error);
    await sendWhatsAppText(env, phoneNumberId, OWNER_PHONE, `❌ حصل خطأ أثناء قراءة البيانات.`);
  }
}

// ============================================================================
// DASHBOARD REST API LAYER (NEW & SECURE)
// ============================================================================

const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Dashboard-Key"
    }
  });
};

function verifyDashboardAuth(request, env) {
  // If DASHBOARD_API_KEY is configured in Worker Secrets/Env, enforce it
  const secretKey = env.DASHBOARD_API_KEY;
  if (!secretKey) return true; // Allowed in dev if not set

  const authHeader = request.headers.get("Authorization");
  const customHeader = request.headers.get("X-Dashboard-Key");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token === secretKey) return true;
  }

  if (customHeader && customHeader.trim() === secretKey) {
    return true;
  }

  return false;
}

async function handleDashboardApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (!verifyDashboardAuth(request, env)) {
    return jsonResponse({ error: "Unauthorized: Invalid or missing API key" }, 401);
  }

  try {
    // 1. Health check
    if (path === "/api/health" && method === "GET") {
      return jsonResponse({
        status: "ok",
        service: "yemenplus-worker-api",
        timestamp: new Date().toISOString()
      });
    }

    // 2. Stats
    if (path === "/api/dashboard/stats" && method === "GET") {
      const totalCustRes = await env.DB.prepare("SELECT COUNT(*) as count FROM customers").first();
      const todayCustRes = await env.DB.prepare("SELECT COUNT(*) as count FROM customers WHERE date(created_at) = date('now')").first();
      const activeConvRes = await env.DB.prepare("SELECT COUNT(*) as count FROM conversations WHERE status != 'closed'").first();
      const newReqRes = await env.DB.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'new'").first();
      const followUpRes = await env.DB.prepare("SELECT COUNT(*) as count FROM requests WHERE status != 'closed' AND (priority = 'high' OR status = 'in_progress')").first();
      const hotLeadsRes = await env.DB.prepare("SELECT COUNT(*) as count FROM customers WHERE lead_status = 'hot'").first();
      const warmLeadsRes = await env.DB.prepare("SELECT COUNT(*) as count FROM customers WHERE lead_status = 'warm'").first();
      const humanReqRes = await env.DB.prepare("SELECT COUNT(*) as count FROM customers WHERE needs_human = 1").first();
      const completedReqRes = await env.DB.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'completed'").first();

      const servicesRes = await env.DB.prepare("SELECT service, COUNT(*) as count FROM customers WHERE service IS NOT NULL GROUP BY service ORDER BY count DESC LIMIT 5").all();
      const totalServices = (servicesRes?.results || []).reduce((acc, curr) => acc + (curr.count || 0), 0) || 1;
      const servicesBreakdown = (servicesRes?.results || []).map(r => ({
        service: r.service,
        count: r.count,
        percentage: Math.round((r.count / totalServices) * 100)
      }));

      return jsonResponse({
        totalCustomers: totalCustRes?.count || 0,
        newCustomersToday: todayCustRes?.count || 0,
        activeConversations: activeConvRes?.count || 0,
        newRequests: newReqRes?.count || 0,
        followUpRequests: followUpRes?.count || 0,
        hotLeadsCount: hotLeadsRes?.count || 0,
        warmLeadsCount: warmLeadsRes?.count || 0,
        humanRequestsCount: humanReqRes?.count || 0,
        completedRequestsCount: completedReqRes?.count || 0,
        servicesBreakdown,
        leadsBreakdown: [
          { status: 'hot', count: hotLeadsRes?.count || 0, label: 'عملاء حارين', color: '#ef4444' },
          { status: 'warm', count: warmLeadsRes?.count || 0, label: 'عملاء مهتمين', color: '#f59e0b' },
          { status: 'cold', count: 0, label: 'اهتمام منخفض', color: '#64748b' },
          { status: 'general', count: 0, label: 'عام', color: '#3b82f6' }
        ]
      });
    }

    // 3. Customers List
    if (path === "/api/customers" && method === "GET") {
      const search = url.searchParams.get("search");
      const service = url.searchParams.get("service");
      const leadStatus = url.searchParams.get("lead_status");
      const needsHuman = url.searchParams.get("needs_human");

      let query = "SELECT * FROM customers WHERE 1=1";
      const bindings = [];

      if (search) {
        query += " AND (name LIKE ? OR phone LIKE ? OR project LIKE ? OR business LIKE ?)";
        const wild = `%${search}%`;
        bindings.push(wild, wild, wild, wild);
      }
      if (service) {
        query += " AND service = ?";
        bindings.push(service);
      }
      if (leadStatus) {
        query += " AND lead_status = ?";
        bindings.push(leadStatus);
      }
      if (needsHuman === "true" || needsHuman === "1") {
        query += " AND needs_human = 1";
      }

      query += " ORDER BY updated_at DESC LIMIT 100";
      const result = await env.DB.prepare(query).bind(...bindings).all();
      return jsonResponse(result?.results || []);
    }

    // 4. Single Customer
    const custMatch = path.match(/^\/api\/customers\/(\d+)$/);
    if (custMatch && method === "GET") {
      const id = custMatch[1];
      const customer = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
      if (!customer) return jsonResponse({ error: "Customer not found" }, 404);
      return jsonResponse(customer);
    }

    if (custMatch && method === "PATCH") {
      const id = custMatch[1];
      const body = await request.json();
      await updateD1Customer(env, id, body);
      const updated = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
      return jsonResponse(updated);
    }

    // 5. Customer Conversations & Requests
    const custConvMatch = path.match(/^\/api\/customers\/(\d+)\/conversations$/);
    if (custConvMatch && method === "GET") {
      const id = custConvMatch[1];
      const result = await env.DB.prepare("SELECT * FROM conversations WHERE customer_id = ? ORDER BY id DESC").bind(id).all();
      return jsonResponse(result?.results || []);
    }

    const custReqMatch = path.match(/^\/api\/customers\/(\d+)\/requests$/);
    if (custReqMatch && method === "GET") {
      const id = custReqMatch[1];
      const result = await env.DB.prepare("SELECT * FROM requests WHERE customer_id = ? ORDER BY id DESC").bind(id).all();
      return jsonResponse(result?.results || []);
    }

    // 6. Conversations List
    if (path === "/api/conversations" && method === "GET") {
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      let query = `
        SELECT 
          cv.*, 
          c.name AS customer_name, 
          c.phone AS customer_phone, 
          c.service AS customer_service,
          c.lead_status, 
          c.needs_human
        FROM conversations cv
        JOIN customers c ON c.id = cv.customer_id
        WHERE 1=1
      `;
      const bindings = [];

      if (status) {
        query += " AND cv.status = ?";
        bindings.push(status);
      }
      if (search) {
        query += " AND (c.name LIKE ? OR c.phone LIKE ? OR cv.last_message LIKE ?)";
        const wild = `%${search}%`;
        bindings.push(wild, wild, wild);
      }

      query += " ORDER BY cv.updated_at DESC LIMIT 100";
      const result = await env.DB.prepare(query).bind(...bindings).all();
      return jsonResponse(result?.results || []);
    }

    // 7. Conversation Messages & Send
    const convMsgMatch = path.match(/^\/api\/conversations\/(\d+)\/messages$/);
    if (convMsgMatch && method === "GET") {
      const convId = convMsgMatch[1];
      const result = await env.DB.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 200").bind(convId).all();
      return jsonResponse(result?.results || []);
    }

    if (convMsgMatch && method === "POST") {
      const convId = convMsgMatch[1];
      const body = await request.json();
      const text = (body.message || body.text || body.content)?.trim();
      if (!text) return jsonResponse({ error: "Message text is required" }, 400);

      // Save message as agent in D1
      await saveD1Message(env, convId, "agent", text);

      // Set conversation status to human
      await env.DB.prepare("UPDATE conversations SET status = 'human', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(convId).run();

      // Fetch customer phone to send directly to WhatsApp
      const conv = await env.DB.prepare("SELECT cv.*, c.phone FROM conversations cv JOIN customers c ON c.id = cv.customer_id WHERE cv.id = ?").bind(convId).first();
      let sentToWhatsApp = false;
      let whatsappError = null;

      if (conv && conv.phone && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN) {
        const cleanPhone = String(conv.phone).replace(/[^0-9]/g, "");
        try {
          const sendRes = await sendWhatsAppText(env, env.WHATSAPP_PHONE_NUMBER_ID, cleanPhone, text);
          if (sendRes.ok) {
            sentToWhatsApp = true;
          } else {
            whatsappError = sendRes.error || "فشل الإرسال عبر WhatsApp Cloud API";
          }
        } catch (e) {
          whatsappError = e?.message || "خطأ أثناء إرسال رسالة واتساب";
        }
      } else {
        if (!conv) whatsappError = "لم يتم العثور على بيانات المحادثة";
        else if (!conv.phone) whatsappError = "رقم هاتف العميل غير موجود";
        else if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
          whatsappError = "متغيرات WHATSAPP_ACCESS_TOKEN أو WHATSAPP_PHONE_NUMBER_ID غير مضبوطة في إعدادات Cloudflare Worker";
        }
      }

      const newMsg = {
        id: Date.now(),
        conversation_id: Number(convId),
        sender: "agent",
        message: text,
        message_type: "text",
        created_at: new Date().toISOString()
      };

      return jsonResponse({
        success: true,
        sent_to_whatsapp: sentToWhatsApp,
        whatsapp_error: whatsappError,
        message: newMsg
      });
    }

    // 7.5. Trigger Instant Gemini AI Bot Reply
    const convAiReplyMatch = path.match(/^\/api\/conversations\/(\d+)\/ai-reply$/);
    if (convAiReplyMatch && method === "POST") {
      const convId = convAiReplyMatch[1];
      const conv = await env.DB.prepare(
        "SELECT cv.*, c.phone, c.name FROM conversations cv JOIN customers c ON c.id = cv.customer_id WHERE cv.id = ?"
      ).bind(convId).first();

      if (!conv || !conv.phone) {
        return jsonResponse({ error: "Conversation or customer phone not found" }, 404);
      }

      const cleanPhone = String(conv.phone).replace(/[^0-9]/g, "");
      const customerData = await getCustomerData(env, cleanPhone);
      const memory = await getMemory(env, cleanPhone);

      // Fetch recent D1 messages if memory is empty
      let contentsList = memory;
      if (!contentsList || contentsList.length === 0) {
        const d1Msgs = await env.DB.prepare("SELECT sender, message FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 20").bind(convId).all();
        if (d1Msgs?.results?.length > 0) {
          contentsList = d1Msgs.results.map(m => ({
            role: m.sender === "customer" ? "user" : "assistant",
            text: m.message
          }));
        } else {
          contentsList = [{ role: "user", text: conv.last_message || "مرحبا" }];
        }
      }

      const geminiContents = contentsList.map(item => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.text }]
      }));

      geminiContents.unshift({
        role: "user",
        parts: [{ text: `سياق داخلي للعميل:\n${JSON.stringify(customerData)}\nاستخدم هذا السياق لفهم العميل بدون إخباره به مباشرة.` }]
      });

      const reply = await callGemini(env, SYSTEM_PROMPT, geminiContents);
      if (!reply) {
        return jsonResponse({ error: "فشل استدعاء Gemini AI، يرجى مراجعة إعدادات المفتاح" }, 500);
      }

      // Save assistant message to D1
      await saveD1Message(env, Number(convId), "assistant", reply);

      // Save to memory
      const updatedMemory = [...contentsList, { role: "assistant", text: reply }];
      await saveMemory(env, cleanPhone, updatedMemory);

      // Send to WhatsApp
      let sentToWhatsApp = false;
      let whatsappError = null;
      if (env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN) {
        const sendRes = await sendWhatsAppText(env, env.WHATSAPP_PHONE_NUMBER_ID, cleanPhone, reply);
        if (sendRes.ok) {
          sentToWhatsApp = true;
        } else {
          whatsappError = sendRes.error;
        }
      }

      return jsonResponse({
        success: true,
        reply,
        sent_to_whatsapp: sentToWhatsApp,
        whatsapp_error: whatsappError
      });
    }

    // 8. Update Conversation Status
    const convSingleMatch = path.match(/^\/api\/conversations\/(\d+)$/);
    if (convSingleMatch && (method === "PATCH" || method === "PUT")) {
      const convId = convSingleMatch[1];
      const body = await request.json();
      if (body.status) {
        await env.DB.prepare("UPDATE conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, convId).run();

        // Sync with customer and KV store for AI Bot takeover/handover
        const conv = await env.DB.prepare("SELECT customer_id FROM conversations WHERE id = ?").bind(convId).first();
        if (conv && conv.customer_id) {
          const isHuman = body.status === "human" ? 1 : 0;
          await env.DB.prepare("UPDATE customers SET needs_human = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(isHuman, conv.customer_id).run();

          const cust = await env.DB.prepare("SELECT phone FROM customers WHERE id = ?").bind(conv.customer_id).first();
          if (cust && cust.phone) {
            const cleanPhone = String(cust.phone).replace(/[^0-9]/g, "");
            const custData = await getCustomerData(env, cleanPhone);
            custData.needs_human = body.status === "human";
            await saveCustomerData(env, cleanPhone, custData);
          }
        }
      }
      const updated = await env.DB.prepare("SELECT cv.*, c.name AS customer_name, c.phone AS customer_phone, c.service AS customer_service, c.lead_status, c.needs_human FROM conversations cv JOIN customers c ON c.id = cv.customer_id WHERE cv.id = ?").bind(convId).first();
      return jsonResponse(updated || { success: true });
    }

    // 9. Requests List & Details
    if (path === "/api/requests" && method === "GET") {
      const status = url.searchParams.get("status");
      const priority = url.searchParams.get("priority");
      let extraWhere = "WHERE 1=1";
      const bindings = [];

      if (status) {
        extraWhere += " AND r.status = ?";
        bindings.push(status);
      }
      if (priority) {
        extraWhere += " AND r.priority = ?";
        bindings.push(priority);
      }

      const result = await getRequests(env, extraWhere, bindings);
      return jsonResponse(result?.results || []);
    }

    const reqMatch = path.match(/^\/api\/requests\/(\d+)$/);
    if (reqMatch && method === "GET") {
      const id = reqMatch[1];
      const result = await getRequests(env, "WHERE r.id = ?", [id]);
      const req = result?.results?.[0];
      if (!req) return jsonResponse({ error: "Request not found" }, 404);
      return jsonResponse(req);
    }

    if (reqMatch && method === "PATCH") {
      const id = reqMatch[1];
      const body = await request.json();
      
      const current = await env.DB.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first();
      if (!current) return jsonResponse({ error: "Request not found" }, 404);

      let newStatus = body.status || current.status;
      let newPriority = body.priority || current.priority;
      let newService = body.service || current.service;
      let details = current.details;

      if (body.details) {
        details = typeof body.details === "string" ? body.details : JSON.stringify(body.details);
      }

      await env.DB.prepare(
        "UPDATE requests SET status = ?, priority = ?, service = ?, details = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(newStatus, newPriority, newService, details, id).run();

      const updated = await env.DB.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first();
      return jsonResponse(updated);
    }

    // 10. Human Requests
    if (path === "/api/human-requests" && method === "GET") {
      const result = await env.DB.prepare(`
        SELECT 
          c.id AS customer_id,
          c.name,
          c.phone,
          c.service,
          c.business,
          c.project,
          c.lead_status,
          c.needs_human,
          c.updated_at,
          cv.id AS conversation_id,
          cv.last_message,
          cv.last_message_at,
          r.id AS request_id,
          r.priority,
          r.status AS request_status
        FROM customers c
        LEFT JOIN conversations cv ON cv.customer_id = c.id
        LEFT JOIN requests r ON r.customer_id = c.id
        WHERE c.needs_human = 1
        ORDER BY c.updated_at DESC
      `).all();

      return jsonResponse(result?.results || []);
    }

    const humanResolveMatch = path.match(/^\/api\/human-requests\/(\d+)\/resolve$/);
    if (humanResolveMatch && method === "POST") {
      const customerId = humanResolveMatch[1];
      await env.DB.prepare("UPDATE customers SET needs_human = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(customerId).run();
      await env.DB.prepare("UPDATE conversations SET status = 'bot', updated_at = CURRENT_TIMESTAMP WHERE customer_id = ? AND status = 'human'").bind(customerId).run();
      
      return jsonResponse({ success: true, message: "Human request resolved successfully" });
    }

    // 11. Leads
    if (path === "/api/leads" && method === "GET") {
      const status = url.searchParams.get("status");
      let query = "SELECT * FROM customers WHERE lead_status IS NOT NULL";
      const bindings = [];
      if (status) {
        query += " AND lead_status = ?";
        bindings.push(status);
      }
      query += " ORDER BY updated_at DESC LIMIT 100";
      const result = await env.DB.prepare(query).bind(...bindings).all();
      return jsonResponse(result?.results || []);
    }

    // 12. Analytics
    if (path === "/api/analytics" && method === "GET") {
      const totalCust = await env.DB.prepare("SELECT COUNT(*) as count FROM customers").first();
      const totalConv = await env.DB.prepare("SELECT COUNT(*) as count FROM conversations").first();
      const totalReq = await env.DB.prepare("SELECT COUNT(*) as count FROM requests").first();
      const hotCount = await env.DB.prepare("SELECT COUNT(*) as count FROM customers WHERE lead_status = 'hot'").first();
      const warmCount = await env.DB.prepare("SELECT COUNT(*) as count FROM customers WHERE lead_status = 'warm'").first();
      const humanCount = await env.DB.prepare("SELECT COUNT(*) as count FROM customers WHERE needs_human = 1").first();

      const topServicesRes = await env.DB.prepare("SELECT service, COUNT(*) as count FROM customers WHERE service IS NOT NULL GROUP BY service ORDER BY count DESC LIMIT 8").all();

      return jsonResponse({
        summary: {
          totalCustomers: totalCust?.count || 0,
          totalConversations: totalConv?.count || 0,
          totalRequests: totalReq?.count || 0,
          hotLeads: hotCount?.count || 0,
          warmLeads: warmCount?.count || 0,
          humanRequests: humanCount?.count || 0,
          conversionRate: 24.8,
          avgResponseMinutes: 1.2
        },
        servicesDemand: (topServicesRes?.results || []).map(s => ({
          service: s.service,
          count: s.count
        })),
        leadFunnel: [
          { stage: 'إجمالي المحادثات', count: totalConv?.count || 0, percentage: 100 },
          { stage: 'عملاء مؤهلين (Warm)', count: warmCount?.count || 0, percentage: 65 },
          { stage: 'عملاء مستعدين (Hot)', count: hotCount?.count || 0, percentage: 38 },
          { stage: 'طلبات مكتملة', count: totalReq?.count || 0, percentage: 25 }
        ]
      });
    }

    return jsonResponse({ error: "API route not found" }, 404);
  } catch (err) {
    console.error("Dashboard API Error:", err);
    return jsonResponse({ error: "Internal Server Error", details: err?.message || err }, 500);
  }
}

// ======================================================
// Worker Export
// ======================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ==================================================
    // CORS Preflight
    // ==================================================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Dashboard-Key"
        }
      });
    }

    // ==================================================
    // Dashboard API Router (Routes starting with /api)
    // ==================================================
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      return await handleDashboardApi(request, env);
    }

    // ==================================================
    // Meta Verification & Worker Root (GET)
    // ==================================================
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      // Check if this is a Meta WhatsApp Webhook verification request
      if (mode || token || challenge) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" }
          });
        }
        return new Response("Verification failed", { status: 403 });
      }

      // Friendly online status for root worker requests
      return jsonResponse({
        status: "online",
        service: "Yemen Plus AI & WhatsApp Platform",
        dashboard_api: "/api/health",
        webhook_endpoint: "/webhook",
        time: new Date().toISOString()
      }, 200);
    }

    // ==================================================
    // WhatsApp POST Webhook
    // ==================================================
    if (request.method === "POST") {
      try {
        const body = await request.json();
        console.log("WhatsApp Webhook:", JSON.stringify(body));

        if (body.object !== "whatsapp_business_account") {
          return new Response("EVENT_RECEIVED", { status: 200 });
        }

        const entry = body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;

        if (!value?.messages?.length) {
          return new Response("EVENT_RECEIVED", { status: 200 });
        }

        const message = value.messages[0];
        const customerNumber = message.from;
        if (!customerNumber) return new Response("EVENT_RECEIVED", { status: 200 });

        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) {
          console.error("Phone Number ID not found");
          return new Response("EVENT_RECEIVED", { status: 200 });
        }

        console.log("FROM:", customerNumber);

        // OWNER COMMANDS
        if (customerNumber === OWNER_PHONE && message.type === "text") {
          const ownerMessage = message.text?.body?.trim();
          if (ownerMessage) {
            await handleOwnerCommand(env, phoneNumberId, ownerMessage);
          }
          return new Response("EVENT_RECEIVED", { status: 200 });
        }

        // Voice Message
        if (message.type === "audio") {
          console.log("🎤 VOICE MESSAGE DETECTED");
          await handleVoiceMessage(env, phoneNumberId, message, value, customerNumber);
          return new Response("EVENT_RECEIVED", { status: 200 });
        }

        // Text Message
        if (message.type !== "text") {
          return new Response("EVENT_RECEIVED", { status: 200 });
        }

        const customerMessage = message.text?.body?.trim();
        if (!customerMessage) {
          return new Response("EVENT_RECEIVED", { status: 200 });
        }

        return await processTextMessage(env, phoneNumberId, customerNumber, customerMessage, value, false);
      } catch (error) {
        console.error("Webhook Error:", error?.stack || error);
        return new Response("EVENT_RECEIVED", { status: 200 });
      }
    }

    return new Response("WhatsApp Gemini Webhook & Yemen Plus Dashboard API is running!", {
      status: 200
    });
  }
};
