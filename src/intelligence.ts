/**
 * Deterministic bilingual matching. External text is data, never instructions.
 * Ported directly from app/intelligence.py to TypeScript.
 */

export const SECTORS: Record<string, [string, string, string[]]> = {
  construction: ['المقاولات والإنشاءات', 'Construction', ['مقاول', 'إنشاء', 'انشاء', 'تشييد', 'تشطيب', 'بنية تحتية', 'construction', 'civil', 'contracting']],
  hospitality: ['الفنادق والضيافة', 'Hospitality', ['فندق', 'فنادق', 'ضيافة', 'منتجع', 'hotel', 'hospitality', 'resort']],
  manpower: ['توريد العمالة', 'Manpower', ['عمالة', 'العمال', 'قوى عاملة', 'manpower', 'staffing', 'outsourcing', 'recruitment']],
  housekeeping: ['التدبير الفندقي', 'Housekeeping', ['تدبير فندقي', 'تنظيف غرف', 'housekeeping', 'room cleaning']],
  cleaning: ['خدمات النظافة', 'Cleaning', ['نظافة', 'تنظيف', 'cleaning', 'janitorial']],
  facilities: ['إدارة المرافق', 'Facilities', ['إدارة المرافق', 'ادارة المرافق', 'facility', 'facilities']],
  maintenance: ['التشغيل والصيانة', 'Operation & maintenance', ['صيانة', 'تشغيل', 'maintenance', 'operation', 'hvac', 'mep', 'كهرباء', 'سباكة', 'تكييف']],
  catering: ['الإعاشة', 'Catering', ['إعاشة', 'اعاشة', 'تغذية', 'مطابخ', 'catering', 'kitchen', 'food']],
  security: ['الأمن والحراسة', 'Security', ['حراسة', 'أمن', 'امن', 'security', 'guard']],
  laundry: ['المغاسل', 'Laundry', ['مغاسل', 'غسيل', 'laundry']],
  logistics: ['النقل واللوجستيات', 'Logistics', ['نقل', 'لوجستي', 'logistics', 'transport', 'delivery']],
  landscaping: ['الحدائق والنفايات', 'Landscaping & waste', ['حدائق', 'نفايات', 'landscaping', 'waste']],
  supplies: ['التوريد والمستلزمات', 'Supplies', ['توريد', 'مستلزمات', 'معدات', 'supplies', 'equipment', 'supply']],
  services: ['الخدمات الأخرى', 'Other services', ['خدمات', 'services']],
  general_contracting: ['المقاولات العامة', 'General contracting', ['مقاولات عامة', 'مقاول عام', 'general contracting']],
  mep: ['التكييف والكهرباء والسباكة', 'HVAC & MEP', ['hvac', 'mep', 'كهربائية', 'كهرباء', 'ميكانيكية', 'سباكة', 'تكييف']],
  renovation: ['ترميم وتجديد المباني', 'Building renovation', ['ترميم', 'تجديد مباني', 'renovation', 'refurbishment']],
  hotel_renovation: ['تجديد الفنادق', 'Hotel renovation', ['ترميم فندق', 'تجديد فندق', 'hotel renovation', 'hotel refurbishment']],
  waste: ['إدارة النفايات', 'Waste management', ['نفايات', 'waste management']],
  subcontracting: ['المقاولات من الباطن', 'Subcontracting', ['مقاول من الباطن', 'مقاولات من الباطن', 'subcontract']],
};

export function normalize(text: string | null | undefined): string {
  let s = String(text || '').toLowerCase();
  s = s.replace(/[إأآ]/g, 'ا');
  s = s.replace(/[ًٌٍَُِّْـ]/g, '');
  return s.replace(/ى/g, 'ي');
}

export function classify(text: string | null | undefined): string[] {
  const norm = normalize(text);
  const hits: string[] = [];
  for (const [key, val] of Object.entries(SECTORS)) {
    const matched = val[2].some((w) => {
      const nw = normalize(w);
      if (['العمال', 'أمن', 'امن', 'نقل', 'غسيل'].includes(w)) {
        return new RegExp(`(?:^|[^\\w])${nw}(?:$|[^\\w])`).test(norm);
      }
      return norm.includes(nw);
    });
    if (matched) hits.push(key);
  }
  return hits.length ? hits : ['services'];
}

export function tokens(text: string | null | undefined): string[] {
  return normalize(text).match(/[\w]{2,}/g) || [];
}

export function relevance(query: string | null | undefined, record: any): number {
  if (!query) return 1.0;
  const text = normalize(
    ['title', 'title_en', 'organization', 'organization_en', 'description', 'description_en', 'city', 'reference']
      .map((k) => record[k] || '')
      .join(' ')
  );
  const q = normalize(query);
  if (text.includes(q)) return 1.0;

  const querySectors = new Set(classify(q).filter((s) => s !== 'services'));
  const recordSectors = new Set<string>(record.sectors || []);
  for (const s of querySectors) {
    if (recordSectors.has(s)) return 0.75;
  }

  const qt = new Set(tokens(q));
  if (qt.size === 0) return 0;
  const tt = new Set(tokens(text));
  let count = 0;
  for (const token of qt) {
    if (tt.has(token)) count++;
  }
  return count / qt.size;
}

export function fit(record: any, company: any) {
  if (!company || !company.sectors || !company.sectors.length) {
    return {
      score: null,
      level: 'unknown',
      reasons: [],
      limits: ['حدد أنشطة الشركة لحساب توصية الملاءمة.'],
    };
  }

  const companySectors: string[] = company.sectors || [];
  const recordSectors: string[] = record.sectors || [];
  const matched = companySectors.filter((s) => recordSectors.includes(s));
  let rule_score = matched.length > 0 ? 0.7 : 0.1;
  const reasons: string[] = matched.length > 0
    ? ['تطابق النشاط: ' + matched.map((k) => SECTORS[k]?.[0] || k).join(', ')]
    : [];
  const limits: string[] = matched.length > 0
    ? []
    : ['لم يظهر تطابق واضح بين الأنشطة المعلنة ونشاط الشركة.'];

  const city = String(company.city || '').trim();
  const targets: string[] = (company.target_cities && company.target_cities.length)
    ? company.target_cities
    : (city ? [city] : []);

  const recordCity = record.city || '';
  if (targets.some((c) => normalize(recordCity).includes(normalize(c)))) {
    rule_score += 0.2;
    reasons.push('الموقع يطابق مدينة الشركة.');
  } else if (['السعودية', 'Saudi Arabia', null, ''].includes(recordCity)) {
    rule_score += 0.05;
    limits.push('موقع تنفيذ محدد غير معلن؛ يلزم مراجعة المصدر.');
  } else {
    limits.push('قد يتطلب التنفيذ خارج مدينة الشركة.');
  }

  const lexical = company.services
    ? relevance(company.services, record)
    : (matched.length > 0 ? 1 : 0);

  const score = Math.round(Math.min(1, 0.8 * rule_score + 0.2 * lexical) * 100);
  limits.push('لا توجد أدلة كافية للتحقق من التصنيف القانوني أو القدرة المالية أو عدد العمال المطلوب.');

  return {
    score,
    level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
    rule_score,
    lexical_score: lexical,
    reasons,
    limits,
  };
}

export function engines() {
  return [
    { id: 'rules-v1', name: 'Bilingual sector rules', status: 'ACTIVE', cost: 0, scope: ['classification', 'matching', 'deduplication'] },
    { id: 'lexical-v1', name: 'Bilingual lexical search', status: 'ACTIVE', cost: 0, scope: ['search', 'matching'], note: 'Lexical expansion, not neural semantic embeddings.' },
    { id: 'transformers', name: 'Transformers.js / WebLLM / Ollama', status: 'UNAVAILABLE', cost: 0, scope: [], note: 'No model weights installed or inference service verified.' },
  ];
}
