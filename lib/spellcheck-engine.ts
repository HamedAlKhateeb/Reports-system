'use client';

import { getLocalAiConfig } from './ai-config';

// --------------------------------------------------------------------------
// 1. Direct Arabic Spelling Mistakes & Corrections Dictionary
// --------------------------------------------------------------------------
const ARABIC_DIRECT_REPLACEMENTS: Record<string, string[]> = {
  // Hamzat Wasl errors (words that should NOT have Hamza)
  'إستخدام': ['استخدام'],
  'إستخدامات': ['استخدامات'],
  'إستراتيجية': ['استراتيجية'],
  'إستراتيجيات': ['استراتيجيات'],
  'إستمر': ['استمر'],
  'إستمرار': ['استمرار'],
  'إستثمار': ['استثمار'],
  'إستثمارات': ['استثمارات'],
  'إستثماري': ['استثماري'],
  'إستشارة': ['استشارة'],
  'إستشارات': ['استشارات'],
  'إستقبال': ['استقبال'],
  'إستقرار': ['استقرار'],
  'إستفسار': ['استفسار'],
  'إستفسارات': ['استفسارات'],
  'إستكمال': ['استكمال'],
  'إستلام': ['استلام'],
  'إستماع': ['استماع'],
  'إستناد': ['استناد'],
  'إستهداف': ['استهداف'],
  'إستهلاك': ['استهلاك'],
  'إستيراد': ['استيراد'],
  'إستثنائي': ['استثنائي'],
  'إستثناء': ['استثناء'],
  'إستثناءات': ['استثناءات'],
  'إختيار': ['اختيار'],
  'إختيارات': ['اختيارات'],
  'إختبار': ['اختبار'],
  'إختبارات': ['اختبارات'],
  'إجتماع': ['اجتماع'],
  'إجتماعات': ['اجتماعات'],
  'إجتماعي': ['اجتماعي'],
  'إقتصادي': ['اقتصادي'],
  'إقتصاد': ['اقتصاد'],
  'إتفاق': ['اتفاق'],
  'إتفاقية': ['اتفاقية'],
  'إتفاقيات': ['اتفاقيات'],
  'إكتشاف': ['اكتشاف'],
  'إكتشافات': ['اكتشافات'],
  'إعتماد': ['اعتماد'],
  'إنتهاء': ['انتهاء'],
  'إنتقال': ['انتقال'],
  'إنتشار': ['انتشار'],
  'إشتراك': ['اشتراك'],
  'إشتراط': ['اشتراط'],
  'إشتراطات': ['اشتراطات'],
  'إحترام': ['احترام'],
  'إحتساب': ['احتساب'],
  'إحتواء': ['احتواء'],
  'إحتجاج': ['احتجاج'],
  'إختصاص': ['اختصاص'],
  'إختلاف': ['اختلاف'],
  'إرتفاع': ['ارتفاع'],
  'إرتكاب': ['ارتكاب'],
  'إزدحام': ['ازدحام'],
  'إزدهار': ['ازدهار'],
  'إسم': ['اسم'],
  'إسماء': ['أسماء'],
  'إبن': ['ابن'],
  'إبنة': ['ابنة'],
  'إثنان': ['اثنان'],
  'إثنين': ['اثنين', 'الإثنين'],
  'إمرأة': ['امرأة'],

  // Hamzat Qat' errors (words that MUST have Hamza)
  'احمد': ['أحمد'],
  'اكبر': ['أكبر'],
  'افضل': ['أفضل'],
  'اكثر': ['أكثر'],
  'اهم': ['أهم'],
  'اهمية': ['أهمية'],
  'اول': ['أول'],
  'اولي': ['أولى'],
  'اسبوع': ['أسبوع'],
  'امس': ['أمس'],
  'اخذ': ['أخذ'],
  'امر': ['أمر'],
  'اي': ['أي'],
  'اين': ['أين'],
  'ايضا': ['أيضًا', 'أيضاً'],
  'ايضن': ['أيضًا'],
  'ان': ['أن', 'إن'],
  'انه': ['أنه', 'إنه'],
  'انها': ['أنها', 'إنها'],
  'انهم': ['أنهم', 'إنهم'],
  'انت': ['أنت'],
  'انتم': ['أنتم'],
  'اخ': ['أخ'],
  'اخت': ['أخت'],
  'اب': ['أب'],
  'ام': ['أم'],
  'او': ['أو'],
  'الي': ['إلى'],
  'اليه': ['إليه'],
  'اليها': ['إليها'],
  'اليهم': ['إليهم'],
  'اذا': ['إذا'],
  'اذن': ['إذن'],
  'اذ': ['إذ'],
  'انجاز': ['إنجاز'],
  'انجازات': ['إنجازات'],
  'ارسال': ['إرسال'],
  'انتاج': ['إنتاج'],
  'ادارة': ['إدارة'],
  'ادارات': ['إدارات'],
  'اعادة': ['إعادة'],
  'اعلان': ['إعلان'],
  'اعلانات': ['إعلانات'],
  'اعلام': ['إعلام'],
  'اعداد': ['إعداد'],
  'اصدار': ['إصدار'],
  'اصدارات': ['إصدارات'],
  'اشراف': ['إشراف'],
  'اضافة': ['إضافة'],
  'اطار': ['إطار'],
  'اقامة': ['إقامة'],
  'الزام': ['إلزام'],
  'امكانية': ['إمكانية'],
  'انشاء': ['إنشاء'],
  'انقاذ': ['إنقاذ'],
  'ايراد': ['إيراد'],
  'ايرادات': ['إيرادات'],
  'ايمان': ['إيمان'],
  'ايجابي': ['إيجابي'],
  'ايجابية': ['إيجابية'],
  'اجراء': ['إجراء'],
  'اجراءات': ['إجراءات'],
  'اجمالي': ['إجمالي'],
  'اصلاح': ['إصلاح'],
  'اصلاحات': ['إصلاحات'],
  'اضراب': ['إضراب'],
  'اعفاء': ['إعفاء'],
  'افلاس': ['إفلاس'],
  'اقرار': ['إقرار'],
  'اقناع': ['إقناع'],
  'انكار': ['إنكار'],
  'اهداء': ['إهداء'],
  'اشكال': ['أشكال', 'إشكال'],
  'اشكالية': ['إشكالية'],
  'اخر': ['آخر', 'أخر'],
  'اخرا': ['آخرًا'],
  'اخري': ['أخرى'],
  'افاق': ['آفاق'],
  'الات': ['آلات'],
  'الاف': ['آلاف'],
  'امل': ['أمل', 'آمل'],
  'ايات': ['آيات'],
  'اثار': ['آثار'],
  'اراء': ['آراء'],
  'الام': ['آلام'],
  'اباء': ['آباء'],

  // Taa Marbouta vs Haa (ـه vs ـة)
  'مكتبه': ['مكتبة'],
  'مدرسه': ['مدرسة'],
  'شركه': ['شركة'],
  'تقنيه': ['تقنية'],
  'تقنيات': ['تقنيات'],
  'حياه': ['حياة'],
  'صوره': ['صورة'],
  'جامعه': ['جامعة'],
  'مدينه': ['مدينة'],
  'خاصه': ['خاصة'],
  'عامه': ['عامة'],
  'مهمه': ['مهمة'],
  'جاهزه': ['جاهزة'],
  'جديده': ['جديدة'],
  'قديمه': ['قديمة'],
  'كبيره': ['كبيرة'],
  'صغيره': ['صغيرة'],
  'جميله': ['جميلة'],
  'نتيجه': ['نتيجة'],
  'طريقه': ['طريقة'],
  'خدمه': ['خدمة'],
  'لجنه': ['لجنة'],
  'فتره': ['فترة'],
  'نقطه': ['نقطة'],
  'خطه': ['خطة'],
  'فرصه': ['فرصة'],
  'صفحه': ['صفحة'],
  'قائمه': ['قائمة'],
  'منطقه': ['منطقة'],
  'مرحله': ['مرحلة'],
  'دوله': ['دولة'],
  'حكومه': ['حكومة'],
  'سياسه': ['سياسة'],
  'عمليه': ['عملية'],
  'وثيقه': ['وثيقة'],
  'حاله': ['حالة'],
  'كلمه': ['كلمة'],
  'لغه': ['لغة'],
  'نسبه': ['نسبة'],
  'قيمه': ['قيمة'],
  'جوده': ['جودة'],
  'فائده': ['فائدة'],
  'مجموعه': ['مجموعة'],
  'لوحه': ['لوحة'],
  'صله': ['صلة'],
  'صحه': ['صحة'],
  'بيئه': ['بيئة'],
  'سعاده': ['سعادة'],
  'رغبه': ['رغبة'],
  'قدره': ['قدرة'],
  'سرعه': ['سرعة'],
  'دقه': ['دقة'],
  'علاقه': ['علاقة'],
  'معرفه': ['معرفة'],
  'ثقافه': ['ثقافة'],
  'طاقه': ['طاقة'],
  'حاجه': ['حاجة'],
  'مساله': ['مسألة'],
  'مسأله': ['مسألة'],

  // Mistakes with Haa written as Taa Marbouta (ـة instead of ـه)
  'وجة': ['وجه'],
  'مياة': ['مياه'],
  'اشتباة': ['اشتباه'],
  'توجية': ['توجيه'],
  'فقة': ['فقه'],
  'شبة': ['شبه'],
  'اللة': ['الله'],
  'ابوة': ['أبوه'],
  'معة': ['معه'],
  'فية': ['فيه'],
  'منة': ['منه'],
  'عنة': ['عنه'],
  'علية': ['عليه'],
  'الية': ['إليه'],
  'لدية': ['لديه'],
  'جنية': ['جنيه'],
  'منتبة': ['منتبه'],
  'تشبية': ['تشبيه'],
  'تنوية': ['تنويه'],
  'كرية': ['كريه'],
  'سفية': ['سفيه'],
  'فواكة': ['فواكه'],
  'تجاة': ['تجاه'],

  // Alef Maqsoura vs Yaa (ي vs ى)
  'علي': ['على', 'عَلِيّ'],
  'حتي': ['حتى'],
  'بلي': ['بلى'],
  'مرتضي': ['مرتضى'],
  'مستشفي': ['مستشفى'],
  'معني': ['معنى'],
  'دعوي': ['دعوى'],
  'فتوي': ['فتوى'],
  'فتاوي': ['فتاوى'],
  'مبني': ['مبنى'],
  'منتدي': ['منتدى'],
  'ملتقي': ['ملتقى'],
  'اقصي': ['أقصى'],
  'ادني': ['أدنى'],
  'اعلي': ['أعلى'],
  'احلي': ['أحلى'],
  'موسي': ['موسى'],
  'عيسي': ['عيسى'],
  'هدي': ['هدى'],
  'ندي': ['ندى'],
  'مني': ['منى'],
  'قري': ['قرى'],
  'رؤي': ['رؤى'],
  'مغزي': ['مغزى'],
  'مسعي': ['مسعى'],
  'مجري': ['مجرى'],
  'مرمي': ['مرمى'],
  'مرعي': ['مرعى'],
  'مأوي': ['مأوى'],
  'سلوي': ['سلوى'],
  'فدوي': ['فدوى'],
  'صدي': ['صدى'],
  'مدي': ['مدى'],
  'قضي': ['قضى'],
  'جري': ['جرى'],
  'رمي': ['رمى'],
  'بني': ['بنى', 'بني'],
  'رأي': ['رأى'],

  // Mistakes with ى instead of ي
  'فى': ['في'],
  'التى': ['التي'],
  'الذى': ['الذي'],
  'هى': ['هي'],
  'اخى': ['أخي'],
  'ابى': ['أبي'],
  'وطنى': ['وطني'],
  'عربى': ['عربي'],
  'علمى': ['علمي'],
  'عملى': ['عملي'],

  // Hamza on Nabrah / Waw / Line (الهمزة المتوسطة والمتطرفة)
  'مسؤل': ['مسؤول'],
  'مسؤلين': ['مسؤولين'],
  'مسؤلية': ['مسؤولية'],
  'مسؤوليه': ['مسؤولية'],
  'موتمر': ['مؤتمر'],
  'موتمرات': ['مؤتمرات'],
  'موشر': ['مؤشر'],
  'موشرات': ['مؤشرات'],
  'موسسة': ['مؤسسة'],
  'موسسات': ['مؤسسات'],
  'روية': ['رؤية'],
  'سوال': ['سؤال'],
  'تفاول': ['تفاؤل'],
  'تشاوم': ['تشاؤم'],
  'شئون': ['شؤون'],
  'شئ': ['شيء'],
  'شاطيء': ['شاطئ'],
  'مباديء': ['مبادئ'],
  'قارىء': ['قارئ'],
  'هاديء': ['هادئ'],
  'بادىء': ['بادئ'],
  'مفاجيء': ['مفاجئ'],
  'بطىء': ['بطيء'],
  'بريء': ['بريء'],
  'برىء': ['بريء'],
  'مضىء': ['مضيء'],
  'رئه': ['رئة'],
  'فئه': ['فئة'],
  'مائه': ['مئة', 'مائة'],
  'علما': ['علماء'],
  'اشيا': ['أشياء'],
  'اصدقا': ['أصدقاء'],
  'انبيا': ['أنبياء'],
  'رؤسا': ['رؤساء'],
  'خبرا': ['خبراء'],
  'جزأ': ['جزء'],
  'جزئ': ['جزء'],
  'بدء': ['بدء'],
  'بدىء': ['بدء'],
  'عبء': ['عبء'],
  'عبئ': ['عبء'],
  'كفء': ['كفء'],
  'كفؤ': ['كفء'],

  // Tanween as Noon (النون بدلاً من التنوين)
  'شكرن': ['شكرًا', 'شكراً'],
  'شكرا': ['شكرًا', 'شكراً'],
  'فعلن': ['فعلًا', 'فعلاً'],
  'جدن': ['جدًا', 'جداً'],
  'اهلن': ['أهلًا', 'أهلاً'],
  'مرحبن': ['مرحبًا', 'مرحباً'],
  'حقن': ['حقًا', 'حقاً'],
  'دائمن': ['دائمًا', 'دائماً'],
  'غدن': ['غدًا', 'غداً'],
  'مسائن': ['مساءً'],
  'صباحن': ['صباحًا'],
  'حاليَن': ['حاليًا'],
  'حالين': ['حاليًا', 'حالين'],
  'تقريبن': ['تقريبًا'],
  'خاصتن': ['خاصةً'],
  'عامتن': ['عامةً'],
  'سابقن': ['سابقًا'],
  'لاحقن': ['لاحقًا'],
  'طبعن': ['طبعًا'],
  'فورن': ['فورًا'],
  'بدلن': ['بدلًا'],
  'اصلن': ['أصلًا'],
  'مطلقن': ['مطلقًا'],
  'معن': ['معًا'],
  'سوين': ['سويًا'],
  'جميعن': ['جميعًا'],
  'حتمَن': ['حتمًا'],
  'حتمن': ['حتمًا'],
};

// --------------------------------------------------------------------------
// 2. English Common Typos & Corrections
// --------------------------------------------------------------------------
const ENGLISH_DIRECT_REPLACEMENTS: Record<string, string[]> = {
  'teh': ['the'],
  'recieve': ['receive'],
  'recieved': ['received'],
  'recieving': ['receiving'],
  'seperate': ['separate'],
  'seperated': ['separated'],
  'definately': ['definitely'],
  'definate': ['definite'],
  'untill': ['until'],
  'wierd': ['weird'],
  'thier': ['their'],
  'alot': ['a lot'],
  'allot': ['a lot', 'allot'],
  'alright': ['all right', 'alright'],
  'accross': ['across'],
  'acheive': ['achieve'],
  'acheived': ['achieved'],
  'agressive': ['aggressive'],
  'allign': ['align'],
  'analyzis': ['analysis'],
  'apparant': ['apparent'],
  'appearence': ['appearance'],
  'arguement': ['argument'],
  'basicly': ['basically'],
  'becuase': ['because'],
  'begining': ['beginning'],
  'beleive': ['believe'],
  'beleived': ['believed'],
  'buisness': ['business'],
  'calender': ['calendar'],
  'catagory': ['category'],
  'collegue': ['colleague'],
  'comming': ['coming'],
  'commitee': ['committee'],
  'completly': ['completely'],
  'concious': ['conscious'],
  'dissapear': ['disappear'],
  'dissapoint': ['disappoint'],
  'embarass': ['embarrass'],
  'enviroment': ['environment'],
  'existance': ['existence'],
  'experiance': ['experience'],
  'explaination': ['explanation'],
  'familar': ['familiar'],
  'finaly': ['finally'],
  'foriegn': ['foreign'],
  'foward': ['forward'],
  'goverment': ['government'],
  'grammer': ['grammar'],
  'guarentee': ['guarantee'],
  'garantee': ['guarantee'],
  'happend': ['happened'],
  'harrass': ['harass'],
  'heigth': ['height'],
  'hiearchy': ['hierarchy'],
  'immediatly': ['immediately'],
  'incidently': ['incidentally'],
  'independant': ['independent'],
  'interupt': ['interrupt'],
  'knowlege': ['knowledge'],
  'liason': ['liaison'],
  'libary': ['library'],
  'maintanance': ['maintenance'],
  'millenium': ['millennium'],
  'mispell': ['misspell'],
  'neccessary': ['necessary'],
  'necesary': ['necessary'],
  'noticable': ['noticeable'],
  'occured': ['occurred'],
  'occurence': ['occurrence'],
  'peice': ['piece'],
  'posession': ['possession'],
  'prefered': ['preferred'],
  'priviledge': ['privilege'],
  'procede': ['proceed'],
  'publically': ['publicly'],
  'realy': ['really'],
  'recomended': ['recommended'],
  'reccomend': ['recommend'],
  'refference': ['reference'],
  'relavent': ['relevant'],
  'remeber': ['remember'],
  'resistence': ['resistance'],
  'rythm': ['rhythm'],
  'sieze': ['seize'],
  'similiar': ['similar'],
  'speach': ['speech'],
  'succesful': ['successful'],
  'sucessful': ['successful'],
  'supercede': ['supersede'],
  'suprise': ['surprise'],
  'tendancy': ['tendency'],
  'threshhold': ['threshold'],
  'tommorrow': ['tomorrow'],
  'tommorow': ['tomorrow'],
  'tounge': ['tongue'],
  'truely': ['truly'],
  'twelth': ['twelfth'],
  'unforseen': ['unforeseen'],
  'unfortunatly': ['unfortunately'],
  'whereever': ['wherever'],
  'wich': ['which'],
  'withing': ['within'],
  'writting': ['writing'],
  'dont': ["don't"],
  'cant': ["can't"],
  'wont': ["won't"],
  'didnt': ["didn't"],
  'isnt': ["isn't"],
  'arent': ["aren't"],
  'hasnt': ["hasn't"],
  'havent': ["haven't"],
  'wasnt': ["wasn't"],
  'werent': ["weren't"],
  'shouldnt': ["shouldn't"],
  'wouldnt': ["wouldn't"],
  'couldnt': ["couldn't"],
  'intrest': ['interest'],
  'privilege': ['privilege'],
  'tomatos': ['tomatoes'],
};

// Common Arabic prefixes that can attach to words
const ARABIC_PREFIXES = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];

/**
 * Checks if a word is recognized as having a known spelling error
 */
export function isSpellingError(rawWord: string, lang: 'ar' | 'en' = 'ar'): boolean {
  const word = rawWord.trim();
  if (!word || word.length < 2) return false;

  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(word);
  const hasLatin = /[a-zA-Z]/.test(word);

  if (hasArabic || (!hasLatin && lang === 'ar')) {
    if (ARABIC_DIRECT_REPLACEMENTS[word]) return true;

    // Check with prefixes stripped
    for (const prefix of ARABIC_PREFIXES) {
      if (word.startsWith(prefix) && word.length > prefix.length + 1) {
        const root = word.slice(prefix.length);
        if (ARABIC_DIRECT_REPLACEMENTS[root]) return true;
      }
    }

    // Common heuristics for Arabic spelling flaws
    // 1. Repeated 3+ characters: e.g. مممتاز
    if (/(.)\1{2,}/.test(word)) return true;

    // 2. Starts with "إست" (should be "است" in almost all cases)
    if (word.startsWith('إست') || word.startsWith('والإست') || word.startsWith('بالإست')) return true;

    // 3. Tanween written as noon at the end of word of 4+ chars
    if (word.endsWith('ن') && /^[ا-ي]+$/.test(word)) {
      const rootWithoutNoon = word.slice(0, -1);
      if (['شكر', 'فعل', 'جد', 'اهل', 'مرحب', 'حق', 'دائم', 'غد', 'سابق', 'لاحق', 'طبع', 'فور', 'اصل', 'مطلق', 'سو'].includes(rootWithoutNoon)) {
        return true;
      }
    }
  } else {
    const lower = word.toLowerCase();
    if (ENGLISH_DIRECT_REPLACEMENTS[lower]) return true;
    if (/(.)\1{2,}/.test(lower)) return true;
  }

  return false;
}

/**
 * Generates correction suggestions for a word
 */
export function getSpellingSuggestions(rawWord: string, lang: 'ar' | 'en' = 'ar'): string[] {
  const word = rawWord.trim();
  if (!word || word.length < 2) return [];

  const results: string[] = [];
  const add = (candidate: string) => {
    if (candidate && candidate !== word && !results.includes(candidate)) {
      results.push(candidate);
    }
  };

  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(word);
  const hasLatin = /[a-zA-Z]/.test(word);
  const isArabic = hasArabic || (!hasLatin && lang === 'ar');

  if (isArabic) {
    // 1. Direct dictionary lookup
    if (ARABIC_DIRECT_REPLACEMENTS[word]) {
      ARABIC_DIRECT_REPLACEMENTS[word].forEach(add);
    }

    // 2. Prefix-aware dictionary lookup
    for (const prefix of ARABIC_PREFIXES) {
      if (word.startsWith(prefix) && word.length > prefix.length + 1) {
        const root = word.slice(prefix.length);
        if (ARABIC_DIRECT_REPLACEMENTS[root]) {
          ARABIC_DIRECT_REPLACEMENTS[root].forEach((candidate) => {
            // Adjust prefix for hamza if root now starts with hamza
            let adjustedPrefix = prefix;
            if (prefix === 'و' && (candidate.startsWith('أ') || candidate.startsWith('إ'))) {
              adjustedPrefix = 'و';
            }
            add(adjustedPrefix + candidate);
          });
        }
      }
    }

    // 3. Heuristic Rules
    // Rule A: Remove 3+ duplicate characters
    if (/(.)\1{2,}/.test(word)) {
      const deDuplicated = word.replace(/(.)\1{2,}/g, '$1');
      add(deDuplicated);
      // Also check if deDuplicated has suggestions
      if (ARABIC_DIRECT_REPLACEMENTS[deDuplicated]) {
        ARABIC_DIRECT_REPLACEMENTS[deDuplicated].forEach(add);
      }
    }

    // Rule B: Hamzat Wasl (إستـ -> استـ)
    if (word.includes('إست')) {
      add(word.replace(/إست/g, 'است'));
    }
    if (word.includes('إخت')) {
      add(word.replace(/إخت/g, 'اخت'));
    }
    if (word.includes('إجت')) {
      add(word.replace(/إجت/g, 'اجت'));
    }

    // Rule C: Initial Alef variations (ا -> أ / إ / آ)
    if (word.startsWith('ا') && !word.startsWith('ال')) {
      add('أ' + word.slice(1));
      add('إ' + word.slice(1));
      add('آ' + word.slice(1));
    }

    // Rule D: Taa Marbouta vs Haa at end of word
    if (word.endsWith('ه') && word.length >= 3) {
      add(word.slice(0, -1) + 'ة');
    } else if (word.endsWith('ة') && word.length >= 3) {
      add(word.slice(0, -1) + 'ه');
    }

    // Rule E: Alef Maqsoura vs Yaa at end of word
    if (word.endsWith('ي') && word.length >= 3) {
      add(word.slice(0, -1) + 'ى');
    } else if (word.endsWith('ى') && word.length >= 3) {
      add(word.slice(0, -1) + 'ي');
    }

    // Rule F: Tanween as Noon (e.g. شكرن -> شكرًا)
    if (word.endsWith('ن') && word.length >= 3) {
      add(word.slice(0, -1) + 'ًا');
      add(word.slice(0, -1) + 'اً');
    }
  } else {
    // English suggestions
    const lower = word.toLowerCase();
    const isCapitalized = word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase();
    const isAllUpper = word === word.toUpperCase() && word.length > 1;

    const formatCase = (str: string) => {
      if (isAllUpper) return str.toUpperCase();
      if (isCapitalized) return str.charAt(0).toUpperCase() + str.slice(1);
      return str;
    };

    if (ENGLISH_DIRECT_REPLACEMENTS[lower]) {
      ENGLISH_DIRECT_REPLACEMENTS[lower].forEach((s) => add(formatCase(s)));
    }

    // Remove duplicate consecutive letters (3+)
    if (/(.)\1{2,}/.test(lower)) {
      const deDup = lower.replace(/(.)\1{2,}/g, '$1$1');
      add(formatCase(deDup));
      const deDupSingle = lower.replace(/(.)\1{2,}/g, '$1');
      add(formatCase(deDupSingle));
    }
  }

  // Limit suggestions to top 5 most relevant
  return results.slice(0, 5);
}

/**
 * Optional AI-powered spelling & grammar enhancement.
 * If user has configured an AI API key (Gemini / OpenAI), this queries it for context-rich suggestions.
 */
export async function fetchAiSpellingSuggestions(
  word: string,
  contextSentence?: string
): Promise<string[]> {
  try {
    const config = getLocalAiConfig();
    if (!config.apiKey) return [];

    if (config.provider === 'gemini') {
      const model = config.modelName || 'gemini-1.5-flash';
      const prompt = `أنت مدقق لغوي خبير باللغة العربية والإنجليزية.
الكلمة المستهدفة: "${word}"
${contextSentence ? `سياق الجملة: "${contextSentence}"` : ''}

إذا كانت الكلمة تحتوي على خطأ إملائي أو نحوي أو طباعي، أعطني التصحيحات المقترحة فقط (بحد أقصى 3 اقتراحات)، مفصولة بفواصل دون أي شرح أو مقدمات.
إذا كانت الكلمة صحيحة تماماً ولا تحتاج لأي تصحيح، أرجع كلمة "صحيحة" فقط.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 100,
            },
          }),
        }
      );

      if (!response.ok) return [];
      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

      if (rawText && !rawText.includes('صحيحة')) {
        const parts = rawText
          .split(/[,،\n]+/)
          .map((s: string) => s.trim().replace(/^[-*•"']+|["']+$/g, ''))
          .filter((s: string) => s && s !== word && s.length > 0);
        return parts.slice(0, 4);
      }
    }
  } catch (err) {
    console.warn('AI spelling check fallback failed', err);
  }

  return [];
}

/**
 * Resolves the word boundaries and string at a given document position in ProseMirror.
 */
export function findWordAtPosition(
  doc: any,
  pos: number
): { word: string; from: number; to: number } | null {
  try {
    if (!doc || pos === undefined || pos === null || pos < 0 || pos > doc.content.size) {
      return null;
    }
    const $pos = doc.resolve(pos);
    const parent = $pos.parent;
    if (!parent) return null;

    const parentOffset = $pos.parentOffset;
    const text = parent.textContent;
    if (!text || text.length === 0) return null;

    // Word character regex supporting Arabic, English, digits, diacritics
    const isWordChar = (ch: string) => {
      if (!ch) return false;
      return /[a-zA-Z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF_]/.test(ch);
    };

    let offset = Math.min(parentOffset, text.length - 1);
    if (offset < 0) offset = 0;

    // If pos is right on whitespace or punctuation, check the character before it
    if (!isWordChar(text[offset]) && offset > 0 && isWordChar(text[offset - 1])) {
      offset--;
    }

    if (!isWordChar(text[offset])) return null;

    let start = offset;
    while (start > 0 && isWordChar(text[start - 1])) {
      start--;
    }

    let end = offset;
    while (end < text.length && isWordChar(text[end])) {
      end++;
    }

    const word = text.slice(start, end).trim();
    if (!word) return null;

    const nodeStart = $pos.start();
    const from = nodeStart + start;
    const to = nodeStart + end;

    return { word, from, to };
  } catch (e) {
    console.warn('Error in findWordAtPosition', e);
    return null;
  }
}
