/**
 * Official Saudi procurement source connectors.
 * Connects directly to accessible public endpoints over HTTPS.
 * Respects access restrictions; never fabricates data or marks a source LIVE without verification.
 */
import { classify } from './intelligence.js';
import type { OpportunityRecord } from './types.js';

export interface ConnectorResult {
  sourceId: string;
  sourceName: string;
  status: 'LIVE' | 'AUTH_REQUIRED' | 'BLOCKED' | 'DEGRADED' | 'UNAVAILABLE';
  success: boolean;
  records: OpportunityRecord[];
  notes: string;
  publicAccess: string;
  error?: string;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractCity(text: string): string {
  if (/الرياض/i.test(text)) return 'الرياض';
  if (/جدة/i.test(text)) return 'جدة';
  if (/مكة/i.test(text)) return 'مكة المكرمة';
  if (/المدينة/i.test(text)) return 'المدينة المنورة';
  if (/(الدمام|الخبر|الظهران|الأحساء|الاحساء|الشرقية)/i.test(text)) return 'المنطقة الشرقية';
  if (/(تبوك|الوجه|ضباء|حقل)/i.test(text)) return 'منطقة تبوك';
  if (/(عسير|أبها|خميس مشيط)/i.test(text)) return 'منطقة عسير';
  if (/(القصيم|بريدة|عنيزة)/i.test(text)) return 'منطقة القصيم';
  if (/(جازان|صبيا)/i.test(text)) return 'منطقة جازان';
  if (/نجران/i.test(text)) return 'منطقة نجران';
  if (/حائل/i.test(text)) return 'منطقة حائل';
  if (/(الجوف|سكاكا)/i.test(text)) return 'منطقة الجوف';
  if (/(الحدود الشمالية|عرعر|طريف)/i.test(text)) return 'الحدود الشمالية';
  if (/(الباحة|بلجرشي)/i.test(text)) return 'منطقة الباحة';
  return 'السعودية';
}

/**
 * 1. Etimad Connector
 * Official national procurement platform (NCGR / Ministry of Finance).
 * Uses public JSON API: /Tender/AllSupplierTendersForVisitorAsync
 */
export async function fetchEtimadTenders(pageSize = 30): Promise<ConnectorResult> {
  const sourceId = 'etimad';
  const sourceName = 'منصة اعتماد';
  const url = `https://tenders.etimad.sa/Tender/AllSupplierTendersForVisitorAsync?pageSize=${pageSize}&currentPage=1`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 403) {
        return {
          sourceId,
          sourceName,
          status: 'BLOCKED',
          success: false,
          records: [],
          notes: 'حماية منع الوصول الآلي (403 Forbidden). السجلات السابقة محفوظة.',
          publicAccess: 'BLOCKED',
          error: 'HTTP 403 Forbidden',
        };
      }
      return {
        sourceId,
        sourceName,
        status: 'DEGRADED',
        success: false,
        records: [],
        notes: `استجابة غير متوقعة من المنصة: HTTP ${res.status}`,
        publicAccess: 'DEGRADED',
        error: `HTTP ${res.status}`,
      };
    }

    const json: any = await res.json();
    const items = Array.isArray(json?.data) ? json.data : [];
    const now = new Date().toISOString();

    const records: OpportunityRecord[] = items.map((item: any) => {
      const ref = item.referenceNumber ? String(item.referenceNumber).trim() : String(item.tenderId || '');
      const tenderIdString = item.tenderIdString ? encodeURIComponent(item.tenderIdString) : '';
      const sourceUrl = tenderIdString
        ? `https://tenders.etimad.sa/Tender/DetailsForVisitor?STenderId=${tenderIdString}`
        : 'https://tenders.etimad.sa/Tender/AllTendersForVisitor';

      const deadline = item.lastOfferPresentationDate ? String(item.lastOfferPresentationDate).slice(0, 10) : null;
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
      const isPast = deadline ? deadline < today : false;

      const title = String(item.tenderName || '').trim();
      const activity = String(item.tenderActivityName || '').trim();
      const agencyName = String(item.agencyName || 'جهة حكومية سعودية').trim();
      const sectors = classify(`${title} ${activity}`);
      const city = extractCity(`${agencyName} ${title}`);

      let kind = 'tender';
      const typeName = String(item.tenderTypeName || '');
      if (typeName.includes('تأهيل')) kind = 'qualification';
      else if (typeName.includes('عروض') || typeName.includes('شراء')) kind = 'rfq';

      const feeVal = item.buyingCost ?? item.financialFees ?? item.condetionalBookletPrice;
      const documentFee = feeVal != null ? `${feeVal} ريال` : undefined;

      const reqs: string[] = [];
      if (item.tenderNumber) reqs.push(`رقم المنافسة لدى الجهة: ${item.tenderNumber}`);
      if (item.lastEnqueriesDate) reqs.push(`آخر موعد للاستفسارات: ${String(item.lastEnqueriesDate).slice(0, 10)}`);
      if (item.offersOpeningDate) reqs.push(`موعد فتح العروض: ${String(item.offersOpeningDate).slice(0, 10)}`);
      reqs.push('التقديم يتم عبر منصة اعتماد باستخدام السجل التجاري وحساب المنشأة المعتمد.');

      return {
        id: `etimad-${ref}`,
        source_id: 'etimad',
        kind,
        status: isPast ? 'closed' : 'open',
        title,
        organization: agencyName,
        reference: ref,
        source_url: sourceUrl,
        apply_url: null, // Etimad requires login with commercial registration
        apply_verified: false,
        deadline,
        published_at: item.submitionDate ? String(item.submitionDate).slice(0, 10) : null,
        city,
        description: `${title}. النشاط المعلن: ${activity || 'عام'}`,
        requirements: reqs,
        documents: [],
        sectors,
        confidence: 95,
        last_verified: now,
        verification_method: 'Direct official JSON extraction from tenders.etimad.sa API',
        verification_status: 'verified',
        login_required: true,
        document_fee: documentFee,
        competition_number: item.tenderNumber || undefined,
      };
    });

    return {
      sourceId,
      sourceName,
      status: 'LIVE',
      success: true,
      records,
      notes: `تم الاتصال بنجاح بمنصة اعتماد واستخراج ${records.length} منافسة نشطة في التحقق المباشر.`,
      publicAccess: 'LIVE',
    };
  } catch (err: any) {
    return {
      sourceId,
      sourceName,
      status: 'UNAVAILABLE',
      success: false,
      records: [],
      notes: `تعذر الاتصال بمنصة اعتماد: ${err.message || String(err)}`,
      publicAccess: 'UNAVAILABLE',
      error: err.message || String(err),
    };
  }
}

/**
 * 2. General Authority for Survey and Geospatial Information (Geosa)
 * Official public tenders portal.
 */
export async function probeGeosa(): Promise<ConnectorResult> {
  const sourceId = 'geosa';
  const sourceName = 'الهيئة العامة للمساحة والمعلومات الجيومكانية';
  const url = 'https://www.geosa.gov.sa/ar/Pages/Tenders.aspx';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      return {
        sourceId,
        sourceName,
        status: 'LIVE',
        success: true,
        records: [], // Existing records preserved in archive
        notes: 'بوابة المنافسات الرسمية متاحة ومتحققة عبر الشبكة (200 OK). السجلات السابقة محفوظة.',
        publicAccess: 'LIVE',
      };
    }
    return {
      sourceId,
      sourceName,
      status: 'DEGRADED',
      success: false,
      records: [],
      notes: `استجابة الصفحة: HTTP ${res.status}`,
      publicAccess: 'DEGRADED',
      error: `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      sourceId,
      sourceName,
      status: 'UNAVAILABLE',
      success: false,
      records: [],
      notes: `تعذر الاتصال بصفحة الهيئة: ${err.message || String(err)}`,
      publicAccess: 'UNAVAILABLE',
      error: err.message || String(err),
    };
  }
}

/**
 * 3. Development Authorities Support Center (DASC)
 * Official public news and announcements.
 */
export async function probeDasc(): Promise<ConnectorResult> {
  const sourceId = 'dasc';
  const sourceName = 'مركز دعم هيئات التطوير';
  const url = 'https://www.dasc.gov.sa/news';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      return {
        sourceId,
        sourceName,
        status: 'LIVE',
        success: true,
        records: [],
        notes: 'بوابة إعلانات المركز متاحة ومتحققة عبر الشبكة (200 OK). إعلانات RFP السابقة محفوظة.',
        publicAccess: 'LIVE',
      };
    }
    return {
      sourceId,
      sourceName,
      status: 'DEGRADED',
      success: false,
      records: [],
      notes: `استجابة الصفحة: HTTP ${res.status}`,
      publicAccess: 'DEGRADED',
      error: `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      sourceId,
      sourceName,
      status: 'UNAVAILABLE',
      success: false,
      records: [],
      notes: `تعذر الاتصال بالمركز: ${err.message || String(err)}`,
      publicAccess: 'UNAVAILABLE',
      error: err.message || String(err),
    };
  }
}

/**
 * 4. Saudi Authority for Accredited Valuers (Taqeem)
 * Protected by bot protection (403 Forbidden).
 */
export async function probeTaqeem(): Promise<ConnectorResult> {
  const sourceId = 'taqeem';
  const sourceName = 'الهيئة السعودية للمقيّمين المعتمدين';
  const url = 'https://taqeem.gov.sa/en/tenders?status=current';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 403) {
      return {
        sourceId,
        sourceName,
        status: 'BLOCKED',
        success: false,
        records: [],
        notes: 'الوصول مرفوض (403 Forbidden: حماية من الوصول الآلي). السجلات السابقة محفوظة ومتاحة للاستيراد اليدوي.',
        publicAccess: 'BLOCKED',
        error: 'Bot protection (403 Forbidden)',
      };
    }
    if (res.ok) {
      return {
        sourceId,
        sourceName,
        status: 'LIVE',
        success: true,
        records: [],
        notes: 'تم الاتصال بنجاح بصفحة المنافسات.',
        publicAccess: 'LIVE',
      };
    }
    return {
      sourceId,
      sourceName,
      status: 'DEGRADED',
      success: false,
      records: [],
      notes: `استجابة الصفحة: HTTP ${res.status}`,
      publicAccess: 'DEGRADED',
      error: `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      sourceId,
      sourceName,
      status: 'UNAVAILABLE',
      success: false,
      records: [],
      notes: `تعذر الاتصال: ${err.message || String(err)}`,
      publicAccess: 'UNAVAILABLE',
      error: err.message || String(err),
    };
  }
}

/**
 * 5. Digital Government Authority (DGA)
 * Public procurement budget & tenders page. Protected by Cloudflare WAF (403 Forbidden).
 */
export async function probeDga(): Promise<ConnectorResult> {
  const sourceId = 'dga';
  const sourceName = 'هيئة الحكومة الرقمية';
  const url = 'https://dga.gov.sa/ar/Tenders-Procurements-Budget';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 403) {
      return {
        sourceId,
        sourceName,
        status: 'BLOCKED',
        success: false,
        records: [],
        notes: 'الوصول مرفوض (403 Forbidden). حماية من الوصول الآلي. السجلات السابقة محفوظة ومتاحة للاستيراد اليدوي.',
        publicAccess: 'BLOCKED',
        error: 'HTTP 403 Forbidden',
      };
    }
    if (res.ok) {
      return {
        sourceId,
        sourceName,
        status: 'LIVE',
        success: true,
        records: [],
        notes: 'بوابة هيئة الحكومة الرقمية متاحة ومتحققة عبر الشبكة (200 OK).',
        publicAccess: 'LIVE',
      };
    }
    return {
      sourceId,
      sourceName,
      status: 'DEGRADED',
      success: false,
      records: [],
      notes: `استجابة الصفحة: HTTP ${res.status}`,
      publicAccess: 'DEGRADED',
      error: `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      sourceId,
      sourceName,
      status: 'UNAVAILABLE',
      success: false,
      records: [],
      notes: `تعذر الاتصال بصفحة الهيئة: ${err.message || String(err)}. السجلات السابقة محفوظة.`,
      publicAccess: 'UNAVAILABLE',
      error: err.message || String(err),
    };
  }
}

/**
 * Executes all real Saudi source connectors.
 */
export async function runAllConnectors(): Promise<ConnectorResult[]> {
  const results = await Promise.all([
    fetchEtimadTenders(30),
    probeGeosa(),
    probeDasc(),
    probeTaqeem(),
    probeDga(),
  ]);
  return results;
}
