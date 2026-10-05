// Landing-page i18n. English is the authored HTML (captured at start-up); Hindi lives here.
// Elements: data-i18n (text/HTML), data-i18n-aria (aria-label), data-i18n-alt (img alt).
// Fires `kk:lang` on document with detail { lang } whenever the language changes.
export const HI = {
  'st.sup': 'आपका विवरण (सप्लायर)',
  'st.sname': 'कानूनी नाम',
  'st.strade': 'व्यापार नाम (वैकल्पिक)',
  'st.saddr': 'PIN सहित पता',
  'st.aato': 'पिछले वर्ष का टर्नओवर',
  'st.aato1': 'Rs 5 करोड़ तक',
  'st.aato2': 'Rs 5 करोड़ से अधिक',
  'st.gstinhint': '15 अक्षर। हम प्रारूप, राज्य कोड और चेक-अंक जाँचते हैं।',
  'st.sign': 'अधिकृत हस्ताक्षरकर्ता',
  'st.ten': 'किरायेदार (प्राप्तकर्ता)',
  'st.tname': 'किरायेदार का कानूनी नाम',
  'st.taddr': 'PIN सहित बिल का पता',
  'st.tgst': 'किरायेदार की GST स्थिति',
  'st.tcat': 'किरायेदार प्रकार (TDS हेतु)',
  'st.tgstin': 'किरायेदार का GSTIN',
  'st.po': 'PO / संदर्भ (वैकल्पिक)',
  'st.prop': 'संपत्ति',
  'st.pname': 'संपत्ति का नाम',
  'st.unit': 'यूनिट',
  'st.pkind': 'संपत्ति का प्रकार और उपयोग',
  'st.homeres': 'घर — किरायेदार रहता है',
  'st.homebiz': 'घर — कारोबार के लिए',
  'st.pstate': 'संपत्ति किस राज्य में है (आपूर्ति का स्थान)',
  'st.inv': 'बिल और शुल्क',
  'st.billday': 'बिल का दिन',
  'st.terms': 'बिल पर छपने वाली शर्तें',
  'demo.pick': 'या किसी आम स्थिति से शुरू करें',
  'sc.shop': 'कंपनी को दी गई दुकान',
  'sc.shopd': 'आप GST-पंजीकृत · TDS 10%',
  'sc.home': 'परिवार को दिया गया फ़्लैट',
  'sc.homed': 'GST से छूट · किराया Rs 50,000 से कम',
  'sc.rcm': 'अपंजीकृत मकान-मालिक, पंजीकृत किरायेदार',
  'sc.rcmd': 'GST किरायेदार भरता है (रिवर्स चार्ज)',
  'sc.short': 'भुगतान कम आया',
  'sc.shortd': 'जानें बैंक में कम क्यों दिखा',
  'demo.need': 'ये तैयार रखें',
  'need.1': 'अनुबंध के अनुसार महीने का किराया',
  'need.2': 'आप और किरायेदार GST-पंजीकृत हैं या नहीं',
  'need.3': 'बैंक में आई राशि, और किरायेदार द्वारा बताया TDS',
  'reg.already': 'क्या आपके PAN पर पहले से GST पंजीकरण है (किसी भी कारोबार के लिए)?',
  's1.a': 'किरायेदार और संपत्ति',
  's1.b': 'किराया, मेंटेनेंस, DG',
  's1.c': 'बढ़ोतरी की तारीख़ें',
  's1.time': 'लगभग 5 मिनट, एक बार',
  's2.a': 'दो अलग PDF',
  's2.b': '3 टेम्पलेट',
  's2.c': 'GST केवल जहाँ लागू',
  's2.time': 'महीने में एक क्लिक',
  's3.a': 'दोनों बिलों का ईमेल ड्राफ़्ट',
  's3.b': 'ZIP डाउनलोड',
  's3.c': 'नियंत्रण आपके हाथ',
  's3.time': 'एक मिनट से कम',
  's4.a': 'आंशिक भुगतान',
  's4.b': 'बताया गया TDS',
  's4.c': 'बैंक CSV आयात',
  's4.time': 'कमी तुरंत दिखती है',
  's5.a': 'GSTR-1 / 3B / QRMP',
  's5.b': 'किराया देय तारीख़ें',
  's5.c': '.ics रिमाइंडर',
  's5.time': '5 दिन और 1 दिन पहले अलर्ट',
  's6.a': 'लेजर CSV',
  's6.b': 'सभी PDF एक ZIP में',
  's6.c': 'गायब दस्तावेज़ सूची',
  's6.time': 'जब CA माँगे, तैयार',
  'ph.rent': 'किराया',
  'ph.gst': 'GST, केवल अगर आप वसूलते हैं',
  'ph.tds': 'किरायेदार द्वारा काटा TDS',
  'ph.exp': 'आपके बैंक में क्या आना चाहिए',
  'ph.next': 'आगे क्या होगा',
  'ph.n1t': 'हम कर नियम जाँचते हैं',
  'ph.n1d': 'फ़ॉरवर्ड चार्ज, रिवर्स चार्ज या छूट — आपके उत्तरों से, अनुमान से नहीं।',
  'ph.n2t': 'हम आपके बैंक से तुलना करते हैं',
  'ph.n2d': 'कम, अधिक या बराबर — Rs. 1 के भीतर।',
  'ph.n3t': 'आपको अधिकतम तीन अगले कदम मिलते हैं',
  'ph.n3d': 'जैसे किरायेदार से TDS प्रमाणपत्र माँगना, या CA से जाँचना।',
  'reg.label': 'क्या मुझे GST पंजीकरण चाहिए?',
  'reg.h2a': 'पंजीकरण करें या नहीं?',
  'reg.h2b': 'देखें आप कितनी दूर हैं।',
  'reg.lede': 'हर संपत्ति का मासिक किराया और शुल्क जोड़ें। हम GST कानून के तरीके से साल का जोड़ लगाते हैं और सीधे शब्दों में बताते हैं कि पंजीकरण चाहिए या नहीं — और क्यों।',
  'reg.state': 'आपका राज्य',
  'reg.fy': 'वित्तीय वर्ष',
  'reg.rentals': 'आपके किराये',
  'reg.add': '+ एक और संपत्ति जोड़ें',
  'reg.other': 'साल की अन्य कारोबारी आय (उसी PAN पर, वैकल्पिक)',
  'reg.othertax': 'क्या यह आय GST में कर-योग्य है?',
  'reg.exemptopt': 'नहीं / छूट वाली',
  'reg.private': 'आपके ब्राउज़र में गणना। कुछ भेजा या सहेजा नहीं जाता।',
  'nav.reg': 'GST पंजीकरण',
  skip: 'मुख्य सामग्री पर जाएँ', menu: 'मेनू खोलें',
  'nav.how': 'यह कैसे काम करता है', 'nav.invoices': 'बिल', 'nav.calendar': 'कर कैलेंडर', 'nav.faq': 'सवाल-जवाब', 'nav.app': 'मेरा वर्कस्पेस', 'nav.cta': 'इस महीने का किराया जाँचें',
  'hero.eyebrow': 'भारत के छोटे मकान-मालिकों के लिए', 'hero.h1a': 'आपका किराया। आपका हिसाब।', 'hero.h1b': 'काम थोड़ा कम।',
  'hero.lede': 'किराये के बिल बनाइए, GST और TDS जाँचिए, भुगतान मिलाइए, और देखिए कि आगे क्या करना है।',
  'hero.cta1': 'तैयार उदाहरण आज़माएँ', 'hero.cta2': 'अपनी जानकारी डालें', 'hero.quiet': 'डेमो के लिए लॉग-इन नहीं चाहिए · हिंदी और अंग्रेज़ी',
  'hero.alt': 'एक काल्पनिक बुज़ुर्ग भारतीय मकान-मालिक लैपटॉप पर, अनुबंध, बिल, मिलान किए गए भुगतान और कैलेंडर रिमाइंडर के क्रम के साथ।',
  'card.tag': 'उदाहरण', 'card.fc': 'फ़ॉरवर्ड चार्ज', 'card.rent': 'किराया', 'card.gst': '+ GST', 'card.gstwho': '(आप वसूलते हैं)', 'card.tds': '− TDS', 'card.tdswho': '(किरायेदार ने बताया)', 'card.exp': '= बैंक में अपेक्षित', 'card.match': 'राशियाँ मेल खाती हैं',
  'card.fine': 'केवल गणित की जाँच — कर प्रमाणपत्र नहीं। नियम CA सत्यापन के लिए चिह्नित हैं।',
  'usage.label': 'स्थानीय डेमो गतिविधि', 'usage.empty': 'इस कंप्यूटर पर अभी कोई जाँच नहीं हुई।', 'usage.rent': 'जाँचा गया किराया', 'usage.months': 'बंद किए गए महीने', 'usage.caught': 'पकड़े गए अंतर', 'usage.common': 'सबसे आम स्थिति',
  'routine.label': 'हर महीने का काम', 'routine.h2a': 'कुछ संपत्तियाँ।', 'routine.h2b': 'काग़ज़ी काम बहुत।',
  'routine.lede': 'हर महीने वही बिल टाइप करना। भुगतान थोड़ा कम आना और कोई कारण न बताना। GST की तारीख़ फिर से ढूँढना। KirayaKhata इसे एक दोहराने योग्य क्रम बना देता है।',
  's1.t': 'अनुबंध एक बार जोड़ें', 's1.d': 'किरायेदार, किराया, मेंटेनेंस, बढ़ोतरी की तारीख़ और बिल का दिन — सहेजा हुआ, ताकि अगले महीने दोबारा टाइप न करना पड़े।',
  's2.t': 'बिल तैयार करें', 's2.d': 'किराये और मेंटेनेंस के अलग-अलग दस्तावेज़, GST केवल वहीं जहाँ लागू हो।',
  's3.t': 'किरायेदार को भेजें', 's3.d': 'PDF डाउनलोड करें और ईमेल ड्राफ़्ट खोलें। अटैच करके भेजना आपका काम — अपने-आप कुछ नहीं जाता।',
  's4.t': 'भुगतान मिलाएँ', 's4.d': 'किराया + GST − किरायेदार का बताया TDS, बैंक में आई राशि से तुलना।',
  's5.t': 'अगली अंतिम तारीख़ देखें', 's5.d': 'केवल आप पर लागू काम, पोर्टल लिंक और वहाँ क्या करना है।',
  's6.t': 'साल के अंत का रिकॉर्ड', 's6.d': 'लेजर, बिल, रसीदें और TDS फ़ॉलो-अप एक पैक में — आपकी अपनी समीक्षा या CA के लिए।',
  'pane.agreement': 'सहेजा गया अनुबंध', 'pane.sample': 'नमूना डेटा', 'pane.invoices': 'इस महीने के दो दस्तावेज़', 'pane.share': 'ईमेल ड्राफ़्ट', 'pane.manual': 'आप भेजते हैं', 'pane.match': 'भुगतान जाँच', 'pane.next': 'अगली तारीख़ें', 'pane.year': 'साल के अंत के पैक में',
  'feat.label': 'किराये का पूरा काम एक जगह', 'feat.h2a': 'किराया जैसे सच में चलता है,', 'feat.h2b': 'वैसा ही बना।',
  'f1.t': 'पेशेवर दिखने वाले बिल', 'f1.d': 'अनुबंध की जानकारी, टेम्पलेट चुनना, PDF प्रीव्यू और डाउनलोड।',
  'f2.t': 'हर महीने दोहराने योग्य काम', 'f2.d': 'बिल का दिन, किराया बढ़ोतरी, लीज़ की तारीख़ें, रोकना/समाप्त करना और मंज़ूरी की पसंद।',
  'f3.t': 'समझ में आने वाले भुगतान', 'f3.d': 'अपेक्षित किराया, GST, बताया गया TDS, असल राशि और अंतर।',
  'f4.t': 'अगले कदम के साथ अंतिम तारीख़ें', 'f4.d': 'लागू काम, पोर्टल लिंक और वहाँ के कदम।',
  'f5.t': 'साल के अंत के रिकॉर्ड, समीक्षा के लिए तैयार', 'f5.d': 'किराया लेजर, बिल, रसीदें, TDS फ़ॉलो-अप और अनसुलझे मामले।',
  'badge.demo': 'इस डेमो में उपलब्ध', 'badge.planbg': 'बिना खोले मासिक रन: योजना में', 'badge.planemail': 'असली ईमेल भेजना: योजना में',
  'p0.h': 'किराया बिल — नमूना अनुबंध से सीधे', 'p1.h': 'नमूना संपत्तियों का बिलिंग शेड्यूल', 'p2.h': 'इस महीने की भुगतान जाँच', 'p3.h': 'पश्चिम बंगाल के GST-पंजीकृत मकान-मालिक के आगे के काम', 'p4.h': 'साल के अंत के पैक में क्या है',
  'studio.label': 'बिल स्टूडियो', 'studio.h2a': 'किराया और मेंटेनेंस,', 'studio.h2b': 'दो साफ़ दस्तावेज़।',
  'studio.lede': 'टेम्पलेट और दस्तावेज़ चुनें। प्रीव्यू और PDF एक ही नियमों से एक ही आँकड़े लेते हैं। डेमो दस्तावेज़ हमेशा DRAFT / DEMO चिह्नित होते हैं।',
  'studio.alt': 'चित्र: अलग-अलग लीज़ किराया और मेंटेनेंस बिल, तीन टेम्पलेट और दोनों को रखे एक लिफ़ाफ़ा।',
  'studio.controls': 'दस्तावेज़ सेटिंग', 'studio.set': 'दस्तावेज़', 'mode.separate': 'किराया + मेंटेनेंस (2 बिल)', 'mode.rent': 'केवल किराया', 'mode.maint': 'केवल मेंटेनेंस', 'mode.combined': 'संयुक्त',
  'studio.template': 'टेम्पलेट', 'tpl.classic': 'क्लासिक लेजर', 'tpl.modern': 'मॉडर्न मिनिमल', 'tpl.letterhead': 'प्रोफ़ेशनल लेटरहेड',
  'studio.period': 'बिल का महीना', 'studio.gst': 'आपकी GST स्थिति', 'studio.rent': 'मासिक किराया', 'studio.maint': 'मासिक मेंटेनेंस',
  'studio.mainthint': 'नमूने में मालिक द्वारा पुष्टि किया वर्गीकरण (SAC 9987, 18%) है। आपका अलग हो सकता है — CA से पुष्टि करें।',
  'studio.dg': 'अलग DG / जनरेटर बिल जोड़ें', 'studio.dgamt': 'इस महीने के DG शुल्क', 'studio.dghint': '"DG" में क्या शामिल है, उसी से कर तय होता है। पुष्टि होने तक DG दस्तावेज़ "समीक्षा ज़रूरी" रहता है।',
  'studio.dlrent': 'किराया PDF डाउनलोड करें', 'studio.dlmaint': 'मेंटेनेंस PDF डाउनलोड करें', 'studio.dlboth': 'दोनों डाउनलोड करें (ZIP)', 'studio.mail': 'दोनों बिलों के साथ ईमेल तैयार करें',
  'studio.mailnote': 'ईमेल ड्राफ़्ट आपके मेल ऐप में खुलता है। भेजने से पहले डाउनलोड किए PDF अटैच करें — लिंक फ़ाइल अटैच नहीं कर सकता।',
  'studio.note': 'अलग दिखाने से किराया और मेंटेनेंस कानूनी रूप से अलग आपूर्ति नहीं बन जाते, न उनका कर बदलता है। हर दस्तावेज़ का अपना नंबर, कर सारांश और बकाया रहता है।',
  'opt.regular': 'पंजीकृत (नियमित)', 'opt.unregistered': 'पंजीकृत नहीं', 'opt.yes.regular': 'हाँ (नियमित)', 'opt.composition': 'कंपोज़िशन योजना', 'opt.no': 'नहीं', 'opt.yes': 'हाँ', 'opt.notsure': 'पक्का नहीं',
  'opt.commercial': 'दुकान / ऑफ़िस / व्यावसायिक', 'opt.home': 'आवासीय मकान', 'opt.residence': 'घर के रूप में', 'opt.business': 'कारोबार / ऑफ़िस के लिए', 'opt.choose': 'चुनें…', 'opt.monthly': 'मासिक', 'opt.qrmp': 'तिमाही (QRMP)',
  'demo.label': 'इस महीने का किराया जाँचें', 'demo.h2a': 'क्या सही राशि', 'demo.h2b': 'आपके बैंक में आई?',
  'demo.lede': 'किराया + आपके द्वारा वसूला GST − किरायेदार का बताया TDS — असल में आई राशि से तुलना। राशि मिलना और कर उपचार तय होना, दो अलग बातें हैं।',
  'demo.alt': 'चित्र: अपेक्षित कार्ड (किराया + GST − TDS) की तुलना फ़ोन पर मिले भुगतान से। असली बैंक कनेक्शन नहीं।',
  'demo.example': 'तैयार उदाहरण आज़माएँ', 'demo.own': 'अपनी जानकारी डालें',
  'demo.private': 'आपकी जानकारी इसी ब्राउज़र में रहती है। स्थानीय सर्वर केवल आँकड़े जाँचता है और गुमनाम गिनती रखता है — नाम, GSTIN, PAN या बैंक विवरण कभी नहीं।',
  step1: 'आपके बारे में', step2: 'संपत्ति और किरायेदार', step3: 'इस महीने की राशियाँ',
  'q.gst': 'क्या आप GST में पंजीकृत हैं?', why: 'हम क्यों पूछते हैं', 'why.gst': 'केवल GST-पंजीकृत मकान-मालिक किराये पर GST जोड़ते हैं। अगर आप पंजीकृत नहीं हैं, तो पंजीकृत किरायेदार रिवर्स चार्ज में GST भर सकता है।',
  'q.state': 'संपत्ति किस राज्य में है', 'q.statehint': 'हम मानते हैं कि आपका GST पंजीकरण इसी राज्य में है। अगर नहीं, तो हम समीक्षा के लिए चिह्नित करते हैं।',
  'q.kind': 'संपत्ति किस प्रकार की है?', 'q.use': 'किरायेदार घर का उपयोग कैसे करता है?', 'why.use': 'GST असल उपयोग पर निर्भर है, इमारत के नाम पर नहीं।',
  'q.tgst': 'क्या किरायेदार GST में पंजीकृत है?', 'q.prop': 'क्या किरायेदार एकल स्वामी है जो यह घर निजी तौर पर अपने निवास के लिए ले रहा है?',
  'q.cat': 'किरायेदार कौन है?', 'cat.company': 'कंपनी', 'cat.firm': 'साझेदारी फ़र्म / LLP', 'cat.gov': 'सरकार / बैंक / संस्था', 'cat.indaudit': 'ऑडिट वाले कारोबार के साथ व्यक्ति/HUF', 'cat.ind': 'अन्य व्यक्ति / परिवार (HUF)',
  'q.cathint': 'इसी से तय होता है कि किरायेदार कौन-सा TDS नियम मानता है और कब काटता है।',
  'q.period': 'कौन-सा महीना?', 'q.rent': 'मासिक किराया (GST के बिना)', 'q.recv': 'बैंक में आई राशि', 'q.recvhint': 'अगर अभी कुछ नहीं आया तो ख़ाली छोड़ें।',
  'q.tds': 'किरायेदार के अनुसार काटा गया TDS', 'q.tdshint': 'अगर उन्होंने नहीं बताया तो ख़ाली छोड़ें। हम अपेक्षित राशि दिखाएँगे।', 'q.note': 'कुछ असामान्य? (वैकल्पिक)', 'q.notehint': 'सहेजा नहीं जाता। कृपया नाम या पहचान नंबर न लिखें।',
  back: 'पीछे', next: 'आगे', check: 'राशियाँ जाँचें', startover: 'फिर से शुरू करें',
  'result.empty': 'आपका परिणाम यहाँ दिखेगा: अपेक्षित राशि, आई राशि, अंतर, और कोई कर-बिंदु जिसका उत्तर अभी बाकी है।',
  'cal.label': 'कर कैलेंडर', 'cal.h2a': 'अंतिम तारीख़ें,', 'cal.h2b': 'अगले कदम के साथ।',
  'cal.lede': 'केवल आपके पंजीकरण और अनुबंधों पर लागू काम। हर काम आधिकारिक पोर्टल से जुड़ा है और बताता है कि वहाँ क्या करना है। "हो गया" वह है जो आप बताते हैं — सरकारी सत्यापन नहीं।',
  'cal.alt': 'चित्र: कैलेंडर के चिह्नित दिन GST रिटर्न और किराया देय रिमाइंडर कार्ड से जुड़े, और एक घंटी।',
  'cal.gst': 'GST स्थिति', 'cal.freq': 'फ़ाइलिंग', 'cal.state': 'राज्य', 'cal.prev': 'पिछला महीना', 'cal.next': 'अगला महीना',
  'cal.ics': '.ics डाउनलोड करें (5 दिन और 1 दिन पहले रिमाइंडर)', 'cal.icsnote': 'आयात की गई कैलेंडर फ़ाइल एक स्नैपशॉट है। सरकार तारीख़ बढ़ाए तो यह नहीं बदलेगी — पोर्टल देखें।', 'cal.upcoming': 'आने वाले काम',
  'ye.label': 'महीने के अंत से साल के अंत तक', 'ye.h2a': 'पूरा साल,', 'ye.h2b': 'एक व्यवस्थित पैक में।',
  'ye.lede': 'रिटर्न तैयार करने या CA को देने के लिए व्यवस्थित रिकॉर्ड। एक संपत्ति का किराया आपका पूरा आयकर रिटर्न नहीं है, और KirayaKhata कुछ फ़ाइल नहीं करता।',
  'ye.i1': 'सालाना किराया लेजर (CSV)', 'ye.i2': 'बिल और रसीद सूची', 'ye.i3': 'महीनेवार GST उपचार', 'ye.i4': 'बताया गया TDS और प्रमाणपत्र फ़ॉलो-अप', 'ye.i5': 'बढ़ोतरी का इतिहास और गायब दस्तावेज़',
  'ye.gen': 'डाउनलोड पर बनता है', 'ye.rep': 'बताया गया, असत्यापित', 'ye.csv': 'नमूना लेजर डाउनलोड करें (CSV)', 'ye.zip': 'नमूना पैक डाउनलोड करें (ZIP)',
  'ye.note': 'नमूना पैक = FY 2026-27 का अब तक का काल्पनिक डेटा। आपका अपना पैक "मेरा वर्कस्पेस" में है।', 'ye.alt': 'चित्र: बिल, भुगतान और TDS के दस्तावेज़ एक साल-अंत पैक फ़ोल्डर में जाते हुए।',
  'faq.label': 'सवाल', 'faq.h2a': 'सीधे जवाब,', 'faq.h2b': 'बिना कठिन शब्दों के।',
  q1: 'क्या आवासीय और व्यावसायिक किराये पर GST एक जैसा लगता है?', a1: 'नहीं। अपंजीकृत किरायेदार को निवास के लिए दिया घर छूट में है। GST-पंजीकृत मकान-मालिक के व्यावसायिक किराये पर 18% GST लगता है। GST-पंजीकृत किरायेदार को दिया घर आमतौर पर रिवर्स चार्ज में आता है — किरायेदार भरता है। मायने असल उपयोग का है, इमारत के नाम का नहीं।',
  q2: 'GST मेरा किरायेदार भरता है, मैं नहीं। क्या यह सही है?', a2: 'हो सकता है। 10 अक्टूबर 2024 से, जब अपंजीकृत मकान-मालिक GST-पंजीकृत किरायेदार को व्यावसायिक संपत्ति देता है, तो किरायेदार रिवर्स चार्ज में GST भरता है। 16 जनवरी 2025 से कंपोज़िशन योजना वाले किरायेदार इससे बाहर हैं। वह GST आप अपने बिल में नहीं जोड़ते।',
  q3: 'मेरे बैंक में बिल से कम पैसा क्यों आया?', a3: 'ज़्यादातर TDS के कारण। कंपनियाँ और फ़र्में आमतौर पर Rs. 50,000 प्रति माह से अधिक किराये पर 10% (GST छोड़कर) काटती हैं। छोटे व्यक्तिगत किरायेदार 2% एक बार काटते हैं — मार्च में या किरायेदारी ख़त्म होने पर। TDS तभी आपका क्रेडिट है जब फ़ॉर्म 26AS/AIS में दिखे।',
  q4: 'क्या मैं बिल का रूप चुन सकता हूँ?', a4: 'हाँ — क्लासिक लेजर, मॉडर्न मिनिमल या प्रोफ़ेशनल लेटरहेड। तीनों में वही जानकारी और आँकड़े हैं; केवल रूप बदलता है।',
  q5: 'क्या यह अगले महीने का बिल अपने-आप बनाता है?', a5: 'इस स्थानीय संस्करण में आप "इस महीने के बिल बनाएँ" दबाते हैं और यह सहेजे अनुबंधों से ड्राफ़्ट बनाता है — एक महीने के लिए कभी दो बार नहीं। स्थानीय शेड्यूलर केवल ऐप खुला रहने पर चलता है। पूरी तरह स्वचालित मासिक रन के लिए होस्टेड संस्करण चाहिए (योजना में)।',
  q6: 'क्या यह PDF मेरे किरायेदार को ईमेल करेगा?', a6: 'अभी नहीं। यह आपके मेल ऐप में ड्राफ़्ट खोलता है; आप डाउनलोड किए PDF अटैच करके भेजते हैं। अभ्यास आउटबॉक्स केवल डिलीवरी का अनुकरण करता है और यह साफ़ बताता है।',
  q7: 'कैलेंडर आयात कैसे काम करता है?', a7: '.ics फ़ाइल डाउनलोड करके Google Calendar, Outlook या फ़ोन में खोलें। हर काम के 5 दिन और 1 दिन पहले रिमाइंडर हैं। यह एक स्नैपशॉट है — तारीख़ बढ़ने पर नहीं बदलेगा।',
  q8: 'क्या KirayaKhata मेरे रिटर्न फ़ाइल करता है?', a8: 'नहीं। यह रिकॉर्ड तैयार करता है और बताता है कि GST या आयकर पोर्टल पर क्या करना है। फ़ाइलिंग और भुगतान आधिकारिक पोर्टल पर आप या आपके CA करते हैं।',
  q9: 'क्या मुझे फिर भी CA चाहिए?', a9: 'सामान्य मामलों में KirayaKhata हिसाब करता है और रिकॉर्ड रखता है। असामान्य स्थितियाँ — साझा स्वामित्व, SEZ किरायेदार, मिश्रित उपयोग, अनिवासी मकान-मालिक, और "विशेषज्ञ समीक्षा ज़रूरी" वाले मामले — पेशेवर से पूछें। यहाँ के कर नियम भी CA सत्यापन के लिए चिह्नित हैं।',
  q10: 'मेरी जानकारी कहाँ रखी जाती है?', a10: 'इसी डिवाइस पर, आपके ब्राउज़र स्टोरेज में। यह क्लाउड स्टोरेज नहीं है और हम इसे एन्क्रिप्ट नहीं करते; ब्राउज़र डेटा मिटाने पर यह मिट जाता है। बैकअप के लिए एक्सपोर्ट करें। स्थानीय सर्वर केवल गुमनाम डेमो गिनती रखता है।',
  q11: 'क्या यह हिंदी में उपलब्ध है?', a11: 'हाँ। ऊपर EN / हिं बटन दबाएँ। बिल PDF अभी अंग्रेज़ी में बनते हैं।',
  'close.a': 'अगले महीने का किराया', 'close.b': 'आसान बनाइए।', 'close.app': 'मेरा वर्कस्पेस खोलें',
  'foot.note': 'समीक्षा के लिए तैयार रिकॉर्ड — कर सलाह, फ़ाइलिंग या सरकारी सत्यापन नहीं। नियम तारीख़ और स्रोत सहित हैं और CA सत्यापन के लिए चिह्नित हैं।',
  'foot.product': 'उत्पाद', 'foot.official': 'आधिकारिक स्रोत', 'foot.help': 'सहायता', 'foot.cov': 'GST/TDS कवरेज', 'foot.src': 'स्रोत सूची', 'foot.local': 'स्थानीय प्रोटोटाइप · आपके कंप्यूटर पर चलता है',
};

// Dynamic strings used by app.js (both languages).
export const DYN = {
  en: {
    download: 'Download', draft: 'DRAFT / DEMO', needsReview: 'Tax treatment needs review', needsInfo: 'More information needed', supported: 'Rule applied', amountsMatch: 'Amounts match',
    short: 'Short payment', excess: 'Extra received', cannot: 'Cannot compute yet', awaiting: 'Awaiting payment', provisional: 'Provisional preview in your browser — checking with the local server…',
    serverWins: 'Checked by the local server (same rules).', offline: 'The local server is not reachable, so this is a browser-only demo calculation.', limit: 'You have used the 5 demo checks for today on this computer. Try again after {time}.',
    refused: 'Request refused', validation: 'Please check: {fields}', rent: 'Rent', gstCollected: 'GST you collect', gstRcm: 'GST paid by tenant (reverse charge) — not part of the payment', invoiceValue: 'Invoice value',
    tdsExpected: 'TDS expected', tdsReported: 'TDS reported by tenant', expected: 'Expected in bank', actual: 'Actually received', difference: 'Difference', why: 'Why?', next: 'Next steps', openQuestions: 'Open questions',
    noGst: 'No GST', exempt: 'Exempt', remaining: '{n} demo checks left today', required: 'Please answer this question.', badAmount: 'Enter an amount like 1,00,000', taskDone: 'Marked as done by you', markDone: 'I did this on the portal', undo: 'Undo',
    whatToDo: 'What to do there', openPortal: 'Open {portal} portal', due: 'Due', period: 'Period', who: 'Who', landlord: 'You (landlord)', tenant: 'Tenant', optional: 'Optional', overdue: 'Overdue', upcoming: 'Upcoming', ackRef: 'Acknowledgement no. (optional)',
    source: 'Source', ruleCA: 'Rule marked for CA verification', noTasks: 'No tasks in this period for this profile.', mailSubject: 'Rent and maintenance invoices for {period}', downloaded: 'Downloaded {name}', zipNote: 'ZIP contains two separate PDFs.', copyOk: 'Email draft opened. Attach the downloaded PDFs before sending.',
    reviewDoc: 'Needs review before issue', readyDoc: 'Ready to issue after your review', nextBill: 'Next bill', escal: 'Next change', noDoc: 'Nothing to bill for this selection (no zero-value invoice is created).',
  },
  hi: {
    download: 'डाउनलोड', draft: 'DRAFT / DEMO', needsReview: 'कर उपचार की समीक्षा ज़रूरी', needsInfo: 'और जानकारी चाहिए', supported: 'नियम लागू', amountsMatch: 'राशियाँ मेल खाती हैं',
    short: 'कम भुगतान', excess: 'अधिक मिला', cannot: 'अभी गणना संभव नहीं', awaiting: 'भुगतान की प्रतीक्षा', provisional: 'आपके ब्राउज़र में अस्थायी प्रीव्यू — स्थानीय सर्वर से जाँच हो रही है…',
    serverWins: 'स्थानीय सर्वर ने जाँचा (वही नियम)।', offline: 'स्थानीय सर्वर उपलब्ध नहीं, इसलिए यह केवल ब्राउज़र की डेमो गणना है।', limit: 'आज इस कंप्यूटर पर 5 डेमो जाँच पूरी हो गईं। {time} के बाद फिर कोशिश करें।',
    refused: 'अनुरोध अस्वीकार', validation: 'कृपया जाँचें: {fields}', rent: 'किराया', gstCollected: 'आपके द्वारा वसूला GST', gstRcm: 'किरायेदार द्वारा भरा GST (रिवर्स चार्ज) — भुगतान का हिस्सा नहीं', invoiceValue: 'बिल राशि',
    tdsExpected: 'अपेक्षित TDS', tdsReported: 'किरायेदार द्वारा बताया TDS', expected: 'बैंक में अपेक्षित', actual: 'असल में मिला', difference: 'अंतर', why: 'क्यों?', next: 'अगले कदम', openQuestions: 'खुले प्रश्न',
    noGst: 'GST नहीं', exempt: 'छूट', remaining: 'आज {n} डेमो जाँच बाकी', required: 'कृपया इस प्रश्न का उत्तर दें।', badAmount: '1,00,000 जैसी राशि लिखें', taskDone: 'आपने पूरा चिह्नित किया', markDone: 'मैंने पोर्टल पर यह कर लिया', undo: 'वापस लें',
    whatToDo: 'वहाँ क्या करना है', openPortal: '{portal} पोर्टल खोलें', due: 'अंतिम तारीख़', period: 'अवधि', who: 'किसका काम', landlord: 'आप (मकान-मालिक)', tenant: 'किरायेदार', optional: 'वैकल्पिक', overdue: 'तारीख़ निकल गई', upcoming: 'आने वाला', ackRef: 'पावती नंबर (वैकल्पिक)',
    source: 'स्रोत', ruleCA: 'नियम CA सत्यापन के लिए चिह्नित', noTasks: 'इस प्रोफ़ाइल के लिए इस अवधि में कोई काम नहीं।', mailSubject: '{period} के किराया और मेंटेनेंस बिल', downloaded: '{name} डाउनलोड हुआ', zipNote: 'ZIP में दो अलग PDF हैं।', copyOk: 'ईमेल ड्राफ़्ट खुला। भेजने से पहले डाउनलोड किए PDF अटैच करें।',
    reviewDoc: 'जारी करने से पहले समीक्षा ज़रूरी', readyDoc: 'आपकी समीक्षा के बाद जारी करने योग्य', nextBill: 'अगला बिल', escal: 'अगला बदलाव', noDoc: 'इस चयन के लिए कोई बिल नहीं (शून्य राशि का बिल नहीं बनता)।',
  },
};

const enCache = new Map();
let current = 'en';

export function lang() { return current; }
export function t(key, params = {}) {
  const s = (DYN[current] && DYN[current][key]) || DYN.en[key] || key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

function capture(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { if (!enCache.has(el)) enCache.set(el, { html: el.innerHTML }); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { if (!enCache.has(el)) enCache.set(el, { aria: el.getAttribute('aria-label') || '' }); });
  root.querySelectorAll('[data-i18n-alt]').forEach((el) => { if (!enCache.has(el)) enCache.set(el, { alt: el.getAttribute('alt') || '' }); });
}

export function applyLang(next, dict = HI, root = document) {
  capture(root);
  current = next === 'hi' ? 'hi' : 'en';
  document.documentElement.lang = current;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    el.innerHTML = current === 'hi' && dict[k] ? escapeText(dict[k]) : enCache.get(el).html;
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const k = el.getAttribute('data-i18n-aria');
    const en = enCache.get(el).aria || el.textContent.trim();
    el.setAttribute('aria-label', current === 'hi' && dict[k] ? dict[k] : en || k);
  });
  root.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    const k = el.getAttribute('data-i18n-alt');
    el.setAttribute('alt', current === 'hi' && dict[k] ? dict[k] : enCache.get(el).alt);
  });
  document.querySelectorAll('#lang-toggle [data-l]').forEach((s) => s.classList.toggle('on', s.dataset.l === current));
  try { localStorage.setItem('kk:lang', current); } catch { /* storage may be blocked */ }
  document.dispatchEvent(new CustomEvent('kk:lang', { detail: { lang: current } }));
}

function escapeText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function initLang(dict = HI) {
  let saved = 'en';
  try { saved = localStorage.getItem('kk:lang') || 'en'; } catch { /* ignore */ }
  const btn = document.getElementById('lang-toggle');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => applyLang(current === 'en' ? 'hi' : 'en', dict));
  }
  applyLang(saved, dict);
}
