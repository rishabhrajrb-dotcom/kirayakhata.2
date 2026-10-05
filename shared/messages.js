// Bilingual message catalogue for dynamic engine output. The engine returns codes;
// UI renders msg(code, lang, params). Keep wording plain for non-specialist owners.
export const MESSAGES = {
  SPECIAL_CASE: {
    en: 'This situation ({flags}) needs a tax professional — KirayaKhata does not calculate it.',
    hi: 'इस स्थिति ({flags}) के लिए कर विशेषज्ञ की सलाह ज़रूरी है — KirayaKhata इसकी गणना नहीं करता।',
  },
  MISSING_SUPPLIER_GST: { en: 'Tell us whether you (the landlord) are GST-registered.', hi: 'बताइए कि आप (मकान-मालिक) GST में पंजीकृत हैं या नहीं।' },
  MISSING_RECIPIENT_GST: { en: 'Tell us whether the tenant is GST-registered.', hi: 'बताइए कि किरायेदार GST में पंजीकृत है या नहीं।' },
  MISSING_PROPERTY_KIND: { en: 'Tell us whether the property is a residential dwelling or commercial.', hi: 'बताइए कि संपत्ति आवासीय मकान है या व्यावसायिक।' },
  MISSING_USE: { en: 'Tell us how the tenant actually uses the property (home or business).', hi: 'बताइए कि किरायेदार संपत्ति का उपयोग किस लिए करता है (घर या कारोबार)।' },
  MISSING_PROPRIETOR: {
    en: 'Is the registered tenant a sole proprietor renting this home personally, as their own residence (not for the business)?',
    hi: 'क्या पंजीकृत किरायेदार एकल स्वामी है जो यह घर अपने निजी निवास के लिए (कारोबार के लिए नहीं) ले रहा है?',
  },
  MISSING_STATE: { en: 'Add the property state and your GST registration state.', hi: 'संपत्ति का राज्य और आपका GST पंजीकरण राज्य जोड़ें।' },
  FORWARD_CHARGE: { en: 'You are GST-registered, so you add GST to the rent and pay it to the government.', hi: 'आप GST में पंजीकृत हैं, इसलिए आप किराये पर GST जोड़ते हैं और सरकार को जमा करते हैं।' },
  RCM_RESIDENTIAL: {
    en: 'Residential home let to a GST-registered tenant: the tenant pays the GST under reverse charge. Do not collect it on your bill.',
    hi: 'GST-पंजीकृत किरायेदार को दिया गया आवासीय मकान: GST किरायेदार रिवर्स चार्ज में भरता है। इसे अपने बिल में न वसूलें।',
  },
  RCM_COMMERCIAL: {
    en: 'Commercial property, unregistered landlord, GST-registered tenant: the tenant pays GST under reverse charge (from 10 Oct 2024).',
    hi: 'व्यावसायिक संपत्ति, अपंजीकृत मकान-मालिक, GST-पंजीकृत किरायेदार: 10 अक्टूबर 2024 से GST किरायेदार रिवर्स चार्ज में भरता है।',
  },
  RCM_COMPOSITION_EXCLUDED: {
    en: 'The tenant is a composition taxpayer. From 16 Jan 2025 they are excluded from this reverse charge, so no GST arises on your rent.',
    hi: 'किरायेदार कंपोज़िशन करदाता है। 16 जनवरी 2025 से वे इस रिवर्स चार्ज से बाहर हैं, इसलिए आपके किराये पर GST नहीं बनता।',
  },
  RCM_COMPOSITION_INTERVENING: {
    en: 'Between 10 Oct 2024 and 15 Jan 2025 reverse charge applied to composition tenants and was later regularised "as is where is". Review this period with your CA.',
    hi: '10 अक्टूबर 2024 से 15 जनवरी 2025 के बीच कंपोज़िशन किरायेदारों पर रिवर्स चार्ज लागू था और बाद में "जैसा है जहाँ है" आधार पर नियमित किया गया। इस अवधि की समीक्षा CA से कराएँ।',
  },
  PRE_RCM_COMMERCIAL: {
    en: 'Before 10 Oct 2024 this reverse charge did not exist; today\'s rule is not applied backwards.',
    hi: '10 अक्टूबर 2024 से पहले यह रिवर्स चार्ज लागू नहीं था; आज का नियम पिछली तारीख़ पर लागू नहीं किया जाता।',
  },
  EXEMPT_RESIDENCE: { en: 'Residential home used as a residence by an unregistered tenant: GST exempt.', hi: 'अपंजीकृत किरायेदार द्वारा निवास के रूप में उपयोग किया गया आवासीय मकान: GST से छूट।' },
  EXEMPT_PROPRIETOR: {
    en: 'Registered proprietor renting personally as own residence: exempt (from 1 Jan 2023).',
    hi: 'पंजीकृत स्वामी जो निजी निवास के लिए किराये पर ले रहा है: छूट (1 जनवरी 2023 से)।',
  },
  NO_GST_UNREGISTERED: {
    en: 'You are not GST-registered and no reverse charge applies, so no GST is charged. Check your registration need using your total turnover across all properties.',
    hi: 'आप GST में पंजीकृत नहीं हैं और रिवर्स चार्ज लागू नहीं है, इसलिए GST नहीं लगता। सभी संपत्तियों के कुल टर्नओवर से पंजीकरण की ज़रूरत जाँचें।',
  },
  RESIDENTIAL_BUSINESS_UNREG_LANDLORD: {
    en: 'Home used for business by an unregistered tenant; you are unregistered so no GST is charged. Registration need depends on total turnover.',
    hi: 'अपंजीकृत किरायेदार कारोबार के लिए घर उपयोग कर रहा है; आप अपंजीकृत हैं इसलिए GST नहीं लगता। पंजीकरण की ज़रूरत कुल टर्नओवर पर निर्भर है।',
  },
  COMPOSITION_LANDLORD: { en: 'You are under the composition scheme — a specialist should confirm your document and tax.', hi: 'आप कंपोज़िशन योजना में हैं — दस्तावेज़ और कर की पुष्टि विशेषज्ञ करें।' },
  INTERSTATE: {
    en: 'Property state differs from the GST registration state. Place of supply is where the property is; registration and IGST/CGST+SGST need review.',
    hi: 'संपत्ति का राज्य GST पंजीकरण राज्य से अलग है। आपूर्ति का स्थान संपत्ति वाला राज्य है; पंजीकरण और IGST/CGST+SGST की समीक्षा ज़रूरी है।',
  },
  HISTORICAL_RESIDENTIAL: { en: 'Residential renting before 18 Jul 2022 / during Jul–Dec 2022 follows earlier rules — specialist review.', hi: '18 जुलाई 2022 से पहले / जुलाई–दिसंबर 2022 का आवासीय किराया पुराने नियमों पर चलता है — विशेषज्ञ समीक्षा।' },
  UIN_RECIPIENT: { en: 'Tenant holds a UIN (embassy/UN body) — specialist review.', hi: 'किरायेदार के पास UIN (दूतावास/UN निकाय) है — विशेषज्ञ समीक्षा।' },
  RATE_REQUIRES_VERIFICATION: { en: 'The 18% rate is from our rule table and is marked for CA verification.', hi: '18% दर हमारी नियम-तालिका से है और CA सत्यापन के लिए चिह्नित है।' },
  ITEM_UNCLASSIFIED: {
    en: '{item}: tax treatment not confirmed. Separate billing does not by itself change the tax — confirm SAC, rate and charge type with your CA in the agreement settings.',
    hi: '{item}: कर उपचार की पुष्टि नहीं हुई। अलग बिल बनाने से कर अपने-आप नहीं बदलता — अनुबंध सेटिंग में CA से SAC, दर और चार्ज प्रकार की पुष्टि करें।',
  },
  ITEM_USER_CONFIRMED: { en: '{item}: using the classification you confirmed (SAC {sac}, {rate}%).', hi: '{item}: आपके द्वारा पुष्टि किया गया वर्गीकरण (SAC {sac}, {rate}%) लागू।' },
  // TDS
  TDS_MISSING_CATEGORY: { en: 'Tell us who the tenant is (company, firm, individual…). The TDS rule depends on it.', hi: 'बताइए किरायेदार कौन है (कंपनी, फ़र्म, व्यक्ति…)। TDS नियम इसी पर निर्भर है।' },
  TDS_MISSING_ASSET: { en: 'Is the rent for land/building/furniture, or for machinery/equipment?', hi: 'किराया ज़मीन/भवन/फ़र्नीचर का है या मशीन/उपकरण का?' },
  TDS_NON_RESIDENT: { en: 'Non-resident landlord: different withholding rules apply — specialist review.', hi: 'अनिवासी मकान-मालिक: अलग नियम लागू होते हैं — विशेषज्ञ समीक्षा।' },
  TDS_NO_PAN: { en: 'Without the landlord\'s PAN a higher rate may apply — specialist review.', hi: 'मकान-मालिक के PAN के बिना ऊँची दर लग सकती है — विशेषज्ञ समीक्षा।' },
  TDS_BELOW_THRESHOLD: { en: 'Rent is not above Rs. 50,000 for the month, so no TDS is expected.', hi: 'महीने का किराया Rs. 50,000 से अधिक नहीं है, इसलिए TDS अपेक्षित नहीं।' },
  TDS_GENERAL: { en: 'Tenant deducts {rate}% TDS on the rent (GST excluded) — {section}.', hi: 'किरायेदार किराये (GST छोड़कर) पर {rate}% TDS काटता है — {section}।' },
  TDS_IB_LATER: {
    en: 'This tenant deducts {rate}% TDS once — in March or the last month of the tenancy — not every month ({section}).',
    hi: 'यह किरायेदार {rate}% TDS एक बार काटता है — मार्च में या किरायेदारी के आख़िरी महीने में — हर महीने नहीं ({section})।',
  },
  TDS_IB_NOW: { en: 'This is the deduction month: {rate}% on the year\'s rent so far ({section}).', hi: 'यह कटौती का महीना है: वर्ष के अब तक के किराये पर {rate}% ({section})।' },
  TDS_ANNUAL_NEEDED: { en: 'For this period the threshold was annual — add the expected annual rent.', hi: 'इस अवधि में सीमा वार्षिक थी — अपेक्षित वार्षिक किराया जोड़ें।' },
  TDS_CERT: { en: 'Using the rate on the lower/nil deduction certificate you reported ({rate}%). Keep a copy.', hi: 'आपके बताए कम/शून्य कटौती प्रमाणपत्र की दर ({rate}%) लागू। इसकी प्रति रखें।' },
  TDS_ITEM_REVIEW: { en: '{item}: TDS classification (rent vs contract work) needs review; not assumed.', hi: '{item}: TDS वर्गीकरण (किराया या ठेका) की समीक्षा ज़रूरी; अनुमान नहीं लगाया गया।' },
  TDS_REPORTED_ONLY: { en: 'TDS is what the tenant told you. It becomes usable credit only when it shows in your Form 26AS/AIS.', hi: 'TDS वही है जो किरायेदार ने बताया। यह तभी उपयोगी क्रेडिट है जब आपके फ़ॉर्म 26AS/AIS में दिखे।' },
  // Reconciliation
  REC_MATCH: { en: 'Amounts match (within Rs. 1).', hi: 'राशियाँ मेल खाती हैं (Rs. 1 के भीतर)।' },
  REC_SHORT: { en: 'Received {amount} less than expected.', hi: 'अपेक्षा से {amount} कम मिला।' },
  REC_EXCESS: { en: 'Received {amount} more than expected — keep it as an unapplied excess or advance.', hi: 'अपेक्षा से {amount} अधिक मिला — इसे अतिरिक्त/अग्रिम राशि के रूप में रखें।' },
  REC_CANNOT: { en: 'We cannot work out the expected amount until the open questions are answered.', hi: 'खुले प्रश्नों के उत्तर मिलने तक हम अपेक्षित राशि नहीं निकाल सकते।' },
  REC_TDS_MISMATCH: { en: 'Reported TDS {reported} differs from the expected {expected}. Ask the tenant which rule they applied.', hi: 'बताया गया TDS {reported} अपेक्षित {expected} से अलग है। किरायेदार से पूछें कि कौन-सा नियम लगाया।' },
  REC_TDS_UNRESOLVED: { en: 'We used the TDS the tenant reported because the TDS rule is still unresolved — this is not a confirmation.', hi: 'TDS नियम अभी तय नहीं है, इसलिए किरायेदार का बताया TDS लिया — यह पुष्टि नहीं है।' },
  REC_RCM_NOTE: { en: 'Reverse-charge GST {amount} is the tenant\'s liability and is not part of what they pay you.', hi: 'रिवर्स-चार्ज GST {amount} किरायेदार की देनदारी है और आपको मिलने वाली राशि में शामिल नहीं।' },
  NEXT_ANSWER: { en: 'Answer the open questions above.', hi: 'ऊपर के खुले प्रश्नों के उत्तर दें।' },
  NEXT_ASK_TENANT: { en: 'Ask the tenant for the payment and TDS details.', hi: 'किरायेदार से भुगतान और TDS विवरण माँगें।' },
  NEXT_REVIEW_CA: { en: 'Share this summary with your CA before filing.', hi: 'फ़ाइल करने से पहले यह सारांश अपने CA को दिखाएँ।' },
  NEXT_PREPARE_INVOICE: { en: 'Prepare and share this month\'s invoice.', hi: 'इस महीने का बिल तैयार करके भेजें।' },
  NEXT_TRACK_CERT: { en: 'Follow up for the TDS certificate and check Form 26AS/AIS.', hi: 'TDS प्रमाणपत्र के लिए याद दिलाएँ और फ़ॉर्म 26AS/AIS जाँचें।' },
  NEXT_RECORD_EXCESS: { en: 'Record the extra amount as advance or adjust next month.', hi: 'अतिरिक्त राशि को अग्रिम के रूप में दर्ज करें या अगले महीने समायोजित करें।' },
};

Object.assign(MESSAGES, {
  REG_BELOW: { en: 'You do not need to register yet. Your turnover this year is {total}, below the {limit} limit. You have {left} of room left.', hi: 'अभी पंजीकरण ज़रूरी नहीं। इस साल आपका टर्नओवर {total} है, जो {limit} की सीमा से कम है। अभी {left} की गुंजाइश बाकी है।' },
  REG_BELOW_NEAR: { en: 'Not yet, but you are close. {total} of the {limit} limit is used and only {left} is left. A rent increase or one more property could take you over.', hi: 'अभी नहीं, पर आप सीमा के पास हैं। {limit} में से {total} उपयोग हो चुका और केवल {left} बाकी है। किराया बढ़ने या एक और संपत्ति से आप सीमा पार कर सकते हैं।' },
  REG_ONLY_EXEMPT: { en: 'You do not need to register even though you are above {limit}: all your rent is exempt (homes let as residences). The law excludes people who supply only exempt services.', hi: '{limit} से ऊपर होते हुए भी पंजीकरण ज़रूरी नहीं: आपका सारा किराया छूट वाला है (निवास के लिए दिए घर)। केवल छूट वाली सेवाएँ देने वालों को कानून बाहर रखता है।' },
  REG_ONLY_RCM: { en: 'You do not need to register even though you are above {limit}: on all your rent the tenant pays GST under reverse charge. Suppliers making only such supplies are exempt from registration.', hi: '{limit} से ऊपर होते हुए भी पंजीकरण ज़रूरी नहीं: आपके सारे किराये पर GST किरायेदार रिवर्स चार्ज में भरता है। केवल ऐसी आपूर्ति करने वाले पंजीकरण से मुक्त हैं।' },
  REG_EXEMPT_PLUS_RCM: { en: 'You are above {limit}, but your rent is only a mix of exempt homes and reverse-charge rentals. The exemptions are written for "only exempt" or "only reverse charge" suppliers, so ask a CA before deciding.', hi: 'आप {limit} से ऊपर हैं, पर आपका किराया केवल छूट वाले घरों और रिवर्स-चार्ज किरायों का मिश्रण है। छूट "केवल छूट" या "केवल रिवर्स चार्ज" वालों के लिए लिखी है, इसलिए निर्णय से पहले CA से पूछें।' },
  REG_REQUIRED: { en: 'You need to register. Your turnover {total} is above the {limit} limit by {over}, and part of it ({forward}) is rent on which you yourself must charge GST. Apply on the GST portal within 30 days of crossing the limit.', hi: 'आपको पंजीकरण कराना होगा। आपका टर्नओवर {total}, {limit} की सीमा से {over} अधिक है, और इसका एक हिस्सा ({forward}) ऐसा किराया है जिस पर GST आपको स्वयं लेना है। सीमा पार करने के 30 दिनों के भीतर GST पोर्टल पर आवेदन करें।' },
  REG_UNKNOWN: { en: 'We need a little more information: for each property, tell us the type, how it is used and whether the tenant is GST-registered.', hi: 'थोड़ी और जानकारी चाहिए: हर संपत्ति का प्रकार, उपयोग और किरायेदार GST-पंजीकृत है या नहीं, बताइए।' },
  REG_HOW_COUNTED: { en: 'How it is counted: all rent and charges for the financial year under your PAN, across all properties and states (including exempt home rent), plus any other business turnover. GST itself is not counted.', hi: 'गणना कैसे होती है: आपके PAN के तहत सभी संपत्तियों और राज्यों का वित्तीय वर्ष का पूरा किराया और शुल्क (छूट वाले घर के किराये सहित), और अन्य कारोबारी टर्नओवर। GST की राशि नहीं गिनी जाती।' },
  REG_VOLUNTARY: { en: 'You may still register voluntarily (for example if business tenants want to claim credit), but then you must file returns every period.', hi: 'आप चाहें तो स्वेच्छा से पंजीकरण करा सकते हैं (जैसे कारोबारी किरायेदार क्रेडिट चाहें), पर तब हर अवधि रिटर्न भरना होगा।' },
  REG_SPECIAL: { en: 'A property or your base is in Manipur, Mizoram, Nagaland or Tripura, so the lower Rs 10 lakh limit is used.', hi: 'कोई संपत्ति या आपका आधार मणिपुर, मिज़ोरम, नागालैंड या त्रिपुरा में है, इसलिए कम Rs 10 लाख की सीमा लागू है।' },
  REG_MULTI_STATE: { en: 'Properties in more than one state: once registered, you register separately in each state you supply from. Check with a CA.', hi: 'एक से अधिक राज्यों में संपत्तियाँ: पंजीकरण होने पर हर राज्य में अलग पंजीकरण होता है। CA से जाँचें।' },
  REG_OTHER_TURNOVER_UNCLEAR: { en: 'Tell us whether your other business income is taxable under GST or exempt.', hi: 'बताइए कि आपकी अन्य कारोबारी आय GST में कर-योग्य है या छूट वाली।' },
});

// Registration v2 (overrides earlier wording).
Object.assign(MESSAGES, {
  REG_ALREADY: { en: 'You already have a GST registration under this PAN, so your rent is taxed under it: you add GST on commercial rent and on homes used for business by unregistered tenants. Homes let as residences to unregistered tenants stay exempt, and a registered tenant renting a home pays GST under reverse charge. Add your GSTIN in your profile so invoices become tax invoices.', hi: 'इस PAN पर आपका GST पंजीकरण पहले से है, इसलिए किराये पर उसी से कर लगेगा: व्यावसायिक किराये पर और अपंजीकृत किरायेदार द्वारा कारोबार के लिए उपयोग किए घर पर आप GST जोड़ेंगे। अपंजीकृत किरायेदार को निवास के लिए दिया घर छूट में रहेगा, और पंजीकृत किरायेदार घर लेने पर रिवर्स चार्ज में GST भरेगा। प्रोफ़ाइल में अपना GSTIN जोड़ें ताकि बिल टैक्स इनवॉइस बनें।' },
  REG_REQUIRED: { en: 'You must register. Your turnover {total} is above the {limit} limit by {over}, and {forward} of it is rent on which you yourself must charge GST (for example a commercial tenant who is not GST-registered or is under composition, or a home used for business by an unregistered tenant). Apply on the GST portal within 30 days of crossing the limit. After registration you charge 18% on that rent.', hi: 'आपको पंजीकरण कराना होगा। आपका टर्नओवर {total}, {limit} की सीमा से {over} अधिक है, और इसमें {forward} ऐसा किराया है जिस पर GST आपको स्वयं लेना है (जैसे व्यावसायिक किरायेदार जो GST-पंजीकृत नहीं या कंपोज़िशन में है, या अपंजीकृत किरायेदार द्वारा कारोबार के लिए उपयोग किया घर)। सीमा पार करने के 30 दिनों में GST पोर्टल पर आवेदन करें। पंजीकरण के बाद उस किराये पर आप 18% लेंगे।' },
  REG_ONLY_RCM: { en: 'Not required — but only on strict conditions. You are above {limit}, yet on all your rent the tenant pays GST under reverse charge. Notification 05/2017-Central Tax exempts people who make ONLY such supplies from registering. This breaks if even one condition below stops being true, so tick each one carefully and get a CA’s written confirmation. If in doubt, registering is the safe choice.', hi: 'ज़रूरी नहीं — पर केवल सख़्त शर्तों पर। आप {limit} से ऊपर हैं, फिर भी आपके सारे किराये पर GST किरायेदार रिवर्स चार्ज में भरता है। अधिसूचना 05/2017-केंद्रीय कर ऐसे लोगों को पंजीकरण से छूट देती है जो केवल ऐसी ही आपूर्ति करते हैं। नीचे की एक भी शर्त टूटी तो छूट ख़त्म, इसलिए हर शर्त ध्यान से जाँचें और CA से लिखित पुष्टि लें। संदेह हो तो पंजीकरण सुरक्षित विकल्प है।' },
  REG_ONLY_EXEMPT: { en: 'Not required — on conditions. You are above {limit}, but all your rent is exempt (homes let to unregistered tenants who live there). Section 23 exempts people who supply ONLY exempt services. It breaks if any home is used as an office/shop, a tenant becomes GST-registered, or you earn other taxable income.', hi: 'ज़रूरी नहीं — शर्तों पर। आप {limit} से ऊपर हैं, पर आपका सारा किराया छूट वाला है (अपंजीकृत किरायेदारों को रहने के लिए दिए घर)। धारा 23 केवल छूट वाली सेवाएँ देने वालों को छूट देती है। कोई घर ऑफ़िस/दुकान के रूप में उपयोग हो, कोई किरायेदार GST-पंजीकृत हो जाए, या अन्य कर-योग्य आय हो तो छूट ख़त्म।' },
  REG_EXEMPT_PLUS_RCM: { en: 'Probably required — please get a CA’s view before deciding. You are above {limit} and your rent is a mix of exempt homes and reverse-charge rentals. Both exemptions are written for people who make ONLY one kind of supply, so neither clearly applies. The safe course is to register.', hi: 'संभवतः ज़रूरी — निर्णय से पहले CA की राय लें। आप {limit} से ऊपर हैं और आपका किराया छूट वाले घरों और रिवर्स-चार्ज किरायों का मिश्रण है। दोनों छूटें केवल एक ही प्रकार की आपूर्ति करने वालों के लिए हैं, इसलिए कोई भी साफ़ लागू नहीं। सुरक्षित रास्ता पंजीकरण है।' },
  REG_UNKNOWN: { en: 'We need a few answers first: whether you already have a GST registration under your PAN, and for each property the type, how it is used and the tenant’s GST status (regular, composition or not registered).', hi: 'पहले कुछ उत्तर चाहिए: क्या आपके PAN पर पहले से GST पंजीकरण है, और हर संपत्ति का प्रकार, उपयोग और किरायेदार की GST स्थिति (नियमित, कंपोज़िशन या अपंजीकृत)।' },
  REG_HOW_COUNTED: { en: 'How it is counted: all rent and charges you bill in the financial year (April–March) under your PAN, across all properties and states — including exempt home rent and rent on which tenants pay reverse charge — plus any other business or professional income. GST itself, security deposits, salary, pension, dividends and capital gains are not counted. Bank interest is generally left out for this test (confirm with your CA).', hi: 'गणना कैसे होती है: वित्तीय वर्ष (अप्रैल–मार्च) में आपके PAN पर सभी संपत्तियों और राज्यों का पूरा किराया और शुल्क — छूट वाले घर का किराया और रिवर्स चार्ज वाला किराया भी — और अन्य कारोबारी या पेशेवर आय। GST, सिक्योरिटी डिपॉज़िट, वेतन, पेंशन, डिविडेंड और पूँजीगत लाभ नहीं गिने जाते। बैंक ब्याज आमतौर पर इस जाँच में नहीं गिना जाता (CA से पुष्टि करें)।' },
  REG_CROSS: { en: 'At this yearly amount you would cross the limit around month {month} of the financial year — registration is due within 30 days of that date.', hi: 'इस वार्षिक राशि पर आप वित्तीय वर्ष के लगभग {month}वें महीने में सीमा पार करेंगे — उस तारीख़ से 30 दिनों में पंजीकरण ज़रूरी है।' },
  REG_RCM_TENANT_OTHER_STATE: { en: 'A registered tenant is registered in a different state from the property. Whether reverse charge applies then is disputed — treat that rent as needing a CA’s view.', hi: 'एक पंजीकृत किरायेदार संपत्ति वाले राज्य से अलग राज्य में पंजीकृत है। तब रिवर्स चार्ज लागू होगा या नहीं, यह विवादित है — उस किराये पर CA की राय लें।' },
  COND_ALL_TENANTS_REGULAR: { en: 'Every tenant is a regular GST-registered business in the property’s state (not composition, not unregistered).', hi: 'हर किरायेदार संपत्ति वाले राज्य में नियमित GST-पंजीकृत कारोबार है (कंपोज़िशन या अपंजीकृत नहीं)।' },
  COND_ALL_HOMES_RESIDENCE: { en: 'Every home is lived in by an unregistered tenant — none is used as an office, shop, PG or guest house.', hi: 'हर घर में अपंजीकृत किरायेदार रहता है — कोई ऑफ़िस, दुकान, PG या गेस्ट हाउस नहीं।' },
  COND_NO_OTHER_BILLING: { en: 'You do not separately bill anyone else for maintenance, DG, parking or other services.', hi: 'आप किसी और से अलग से मेंटेनेंस, DG, पार्किंग या अन्य सेवाओं का बिल नहीं लेते।' },
  COND_NO_OTHER_SUPPLIES: { en: 'You have no other business, profession, commission or consultancy income under the same PAN, and no other kind of rental.', hi: 'उसी PAN पर कोई अन्य कारोबार, पेशा, कमीशन या परामर्श आय नहीं, और कोई अन्य प्रकार का किराया नहीं।' },
  COND_STAY_UNREGISTERED: { en: 'You stay unregistered. If you register (even voluntarily), reverse charge stops and you must charge 18% GST yourself.', hi: 'आप अपंजीकृत रहते हैं। पंजीकरण कराने पर (स्वेच्छा से भी) रिवर्स चार्ज बंद हो जाता है और आपको स्वयं 18% GST लेना होगा।' },
});

export function msg(code, lang = 'en', params = {}) {
  const m = MESSAGES[code];
  if (!m) return code;
  return (m[lang] || m.en).replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}
