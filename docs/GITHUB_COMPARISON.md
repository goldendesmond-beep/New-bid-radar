# Saudi BidPilot — مراجعة قواعد GitHub المفتوحة

تاريخ التحقق: 2026-10-09 (UTC). القرار: **الاستيراد الانتقائي من [GiorgosPanagopoulos/bidpilot](https://github.com/GiorgosPanagopoulos/bidpilot)** عند commit `3f7b7698f3ce81da8f6d2b617253151071e6340a`، مع حفظ ترخيص MIT. هذا المشروع الأقرب لسير عمل المورد: قائمة فرص، ملف شركة، نتائج ملاءمة وأسباب، وواجهة React/TypeScript مستقلة. لا توجد قاعدة جاهزة من المرشحين تم التحقق من اتصالها باعتماد أو بقية المصادر السعودية.

## البحث المنفذ فعلًا

نُفذ البحث العام المقيد بـ GitHub بالكلمات السبع المطلوبة: Open Source Tender Management System، Procurement Intelligence Platform، Tender Aggregator، Government Tender Scraper، RFP Monitoring Platform، Supplier Management System، Tender Dashboard. جرى فتح مستودعات النتائج ثم قراءة ملفات LICENSE الفعلية وGitHub API للمشروعات المرشحة، مع فحص ملفات مصدر وتهيئة واختبارات للمرشح المختار. تُحفظ النتائج الخام في `evidence.json` و`code-review-evidence.json`.

استُخدمت أدوات TinyFish Search وFetch للبحث والقراءة؛ لم تُستخدم أتمتة المتصفح المدفوعة. فشل اتصال shell الأول بـ GitHub بسبب عدم توفر proxy على المنفذ 8080؛ أداة القراءة وصلت إلى API العام بنجاح.

## أفضل خمسة مرشحين ذوي ترخيص واضح

الترتيب يقيس ملاءمة المشروع لتسليم Saudi BidPilot خلال نافذة العمل، وليس ترتيبًا عالميًا. تقييم الجودة أدناه مبني على قراءة الملفات والبنية، ولا يعني نجاح تشغيل أو اختبارات لم تُنفذ.

| المشروع | الوظائف الجاهزة | جودة الكود المرصودة | آخر push / آخر تحديث metadata | الترخيص الموثق | التشغيل وقاعدة البيانات | التوسع والقرار |
| --- | --- | --- | --- | --- | --- | --- |
| [BidPilot](https://github.com/GiorgosPanagopoulos/bidpilot) | قائمة مناقصات، ملف شركة، ملاءمة بشرح، شروط وقائمة متطلبات، تحليل ترسيات، واجهة React19/TS/Vite | تقسيم API/models/repositories؛ TypeScript؛ CI فعلية للـ lint/typecheck/Vitest/build؛ قرأنا ScoreBreakdown ومحرك eligibility. لا يثبت CI في الملفات نجاح آخر تشغيل | 2026-06-06 / 2026-10-03 | [MIT](https://github.com/GiorgosPanagopoulos/bidpilot/blob/main/LICENSE)، نص الإذن قرئ فعليًا | frontend: npm ci؛ backend Python3.12/FastAPI؛ MongoDB + Chroma؛ Anthropic API مطلوب افتراضيًا | **أفضل قاعدة جزئية**: نعيد استخدام مكونات الواجهة والأنواع، ونضيف backend مجاني ومصادر سعودية. لا نشغّل مسار Claude المدفوع |
| [Tenders-Pilot](https://github.com/AyoubBentahir/Tenders-Pilot) | موصلات headless، ملفات شركات، تقارير CSV، استخراج PDF، pipeline CLI، SQLite | API + packages منفصلة، SQLAlchemy، registry؛ اختبار unittest موجود؛ المشروع Alpha وذو commit واحد، ويحتاج اختبار موصلاته | 2026-08-26 / 2026-09-04 | [MIT](https://github.com/AyoubBentahir/Tenders-Pilot/blob/main/LICENSE) | Python≥3.11، pip install -e .، Playwright Chromium؛ SQLite افتراضي/ PostgreSQL اختياري؛ مفاتيح AI اختيارية | أساس جيد للـ ingestion، لكنه بلا واجهة مستخدم مكتملة، ومصادره مغربية؛ لا يختصر الواجهة السعودية أكثر من BidPilot |
| [Heidi Tender](https://github.com/heiditender/Heidi-Tender) | تحميل ملفات، pipeline متطلبات، قواعد بإصدارات، SSE، مطابقة منتجات موردين، تسجيل دخول اختياري | عقود واضحة بين 7 مراحل، قواعد snapshot، أدلة نشر وtests؛ توليد SQL بالذكاء يحتاج مراجعة إضافية | 2026-03-22 / 2026-08-26 | [MIT](https://github.com/heiditender/Heidi-Tender/blob/main/LICENSE) | Next.js + FastAPI + PostgreSQL + MySQL؛ Docker Compose؛ يتطلب مفتاح OpenAI | قابل للتوسع في تحليل الملفات، لكنه يركز على سويسرا ومنتجات الإضاءة، ولا يحقق zero-cost افتراضيًا؛ تكييفه أبطأ |
| [Tender Platform](https://github.com/alex-frolov/tender) | إدارة tenders/lots، bids، مزادات، عقود، RBAC/2FA، مفضلة، بحث محفوظ، CSV/XLSX، scheduler | modular monolith، migrations، outbox، money integers، PHPUnit/PHPStan، rate limiting موثق. لم نشغل suite | 2026-08-27 / 2026-10-01 | [MIT](https://github.com/alex-frolov/tender/blob/main/LICENSE) | PHP8.5/Symfony8.1 + PostgreSQL17 + Redis7 + RabbitMQ4 + Mercure؛ عدة حاويات | غني لإدارة شراء جهة مالكة، لكنه أثقل وأبعد عن aggregator مورد سعودي؛ ليس الاختيار العملي خلال المهلة |
| [Open PhilGEPS](https://github.com/csiiiv/philgeps-awards-dashboard) | بحث متعدد الأبعاد، فلاتر، CSV streaming، التحليلات والترسيات، React/Vite | frontend/backend منفصلان، Django، وثائق API، dark mode وCompose. repository كبير نسبيًا؛ لا يوجد إثبات أداء محلي بعد | 2025-12-02 / 2026-06-13 | [MIT](https://github.com/csiiiv/philgeps-awards-dashboard/blob/main/LICENSE)؛ يُعتمد نص LICENSE لا عبارة public domain في README | React/Vite + Django؛ بيانات Parquet ثابتة؛ Compose؛ تشغيل RAM اختياري يحتاج ≥3GB | جيد لتحليلات عقود تاريخية، لكنه لا يوفر فرص سعودية مفتوحة ولا متابعة تقديم؛ يفيد لاحقًا أكثر من كونه قاعدة P0 |

`pushed_at` من GitHub API هو آخر push للمستودع، وليس ادعاءً بأنه تاريخ أحدث commit في الفرع الرئيسي. `updated_at` قد يتغير عند نجمة أو بيانات وصفية؛ لم نخلط بينهما.

## مستودعات مستبعدة أو بدائل إضافية

- [open-tenders](https://github.com/matteux-star/open-tenders): Next.js/Supabase وKanban مفيدان، لكن README نفسه يقر بأن LICENSE غير موجود؛ **لا يُستورد**.
- [TenderScope](https://github.com/cfrost1211-max/TenderScope): يذكر اعتماد في مصدره، لكن الترخيص **Proprietary**؛ **لا يُستورد**، ولا تعني قائمة المصادر نجاح اتصالاته.
- [TenderVault](https://github.com/Souvik3469/TenderVault): React/Express/Mongo مع أدوار وبيدز؛ README يقول MIT لكن لم يظهر LICENSE مستقل في شجرة الملفات المفحوصة؛ **لا يُستورد دون إثبات ترخيص**.
- [tenderX](https://github.com/akashbalyan/tenderX): لا يوجد ترخيص واضح، وREADME يذكر OCR لحل CAPTCHA؛ لا نعيد استخدام هذا المسار.
- [Seple-Tender-Agent](https://github.com/Itinerant18/Seple-Tender-Agent): MIT مقروء وlast push 2026-10-05، لكن مستودع يقارب 384MB وله سطح أدوات وعوامل واسع ومصادر هندية/aggregators؛ تكييفه ومراجعته لا يخدم P0.
- [openrfps-scrapers](https://github.com/dobtco/openrfps-scrapers): GPL-3.0، CoffeeScript وموصلات الولايات الأمريكية؛ يسمح بالتعديل مع التزامات GPL لكن تحديث وتحويل هذا الأساس أبطأ من المرشح المختار.
- [public-tender-analysis-dashboard](https://github.com/samshad/public-tender-analysis-dashboard): MIT، آخر push 2025-05-18؛ Dash/Plotly وBERTopic/CSV، يصلح لتحليل تاريخي دون supplier workflow.

## حدود الاستيراد المقترحة

1. تُحفظ نسخة upstream في مجلد منفصل مع commit والترخيص؛ لا تُحذف أي ملفات حالية سليمة.
2. تُنقل فقط مكونات مفيدة فعليًا، مع نسبة المصدر في THIRD_PARTY_NOTICES، ثم تكييفها للعربية/RTL وللنموذج السعودي.
3. لا يُستورد الاعتماد الإلزامي على Claude/Mongo/Chroma إلى تشغيل zero-cost. لا تُستخدم قواعد upstream المالية كتأكيد أهلية قانونية سعودية.
4. تُحفظ متطلبات ومصادر وروابط التقديم كحقائق مستخرجة فقط؛ تصنيف Fit Score توصية مع أسباب، وليس قرار أهلية.
5. كل موصل سعودي يُختبر من جديد. لا يحمل اسم LIVE إلا إذا نجح الاتصال واستخراج بيانات في التشغيل الفعلي.
6. مقارنة GitHub بحث فعلي، وليست اختبارًا كاملًا للمشاريع الخمسة. تشغيل الاختبارات المطلوبة يكون للنسخة المبنية الناتجة.

## حساب GitHub الحالي

فحص الحساب الخاص ومستودعاته يحتاج GitHub connector أو بيانات اعتماد shell موجودة. البحث العام لا يعادل الوصول إلى حساب المستخدم؛ نتيجة فحص الصلاحيات تحفظ في سجل البيئة العام للمشروع. لا نطلب تسجيل دخول جديد ولا ندّعي فحص مستودعات خاصة دون اتصال مصرح.
