// Amharic / English. Screens call t('English text'); a text that has no Amharic entry below simply stays English,
// so a screen can be translated step by step by wrapping its texts in t() and adding the pair here.
const KEY = 'lang';
export const getLang = () => { try { return localStorage.getItem(KEY) === 'am' ? 'am' : 'en'; } catch { return 'en'; } };
export const setLang = l => { try { localStorage.setItem(KEY, l); } catch { /* private mode: the choice lasts until reload */ } location.reload(); };   // a reload redraws every screen, including the printed ones
export const lang = getLang();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

const AM = {
  // menu and screens
  'Dashboard': 'ዳሽቦርድ', 'Job cards': 'የሥራ ካርዶች', 'Proformas': 'ፕሮፎርማዎች', 'Estimates': 'ግምቶች', 'Workshop': 'አውደ ጥገና', 'Customers': 'ደንበኞች',
  'Parts stock': 'የመለዋወጫ ክምችት', 'Point of sale': 'መሸጫ', 'Invoices & payments': 'ደረሰኞችና ክፍያዎች', 'Purchases (GRN)': 'ግዢዎች (GRN)', 'Services': 'አገልግሎቶች',
  'Labour list': 'የሥራ ዋጋ ዝርዝር', 'Insurance': 'ኢንሹራንስ', 'Reports': 'ሪፖርቶች', 'My hours': 'የእኔ ሰዓታት', 'Stock & sales reports': 'የክምችትና የሽያጭ ሪፖርቶች', 'Staff': 'ሠራተኞች', 'Audit log': 'የእንቅስቃሴ መዝገብ',
  'Work': 'ሥራ', 'Sales & stock': 'ሽያጭና ክምችት', 'Setup': 'ማዋቀር', 'Admin': 'አስተዳደር', 'More': 'ተጨማሪ', 'Menu': 'ምናሌ', 'Insurance proformas': 'የኢንሹራንስ ፕሮፎርማዎች', 'Opening': 'በመክፈት ላይ',
  // sign in
  'Sign in': 'ግባ', 'Sign out': 'ውጣ', 'Signing in…': 'በመግባት ላይ…', 'Username': 'የተጠቃሚ ስም', 'Password': 'የይለፍ ቃል', 'Wrong username or password': 'የተጠቃሚ ስም ወይም የይለፍ ቃል ስህተት ነው',
  'Two-step code': 'የሁለት ደረጃ ኮድ', 'Enter the 6-digit code from your authenticator app': 'ከአውቲንቲኬተር መተግበሪያዎ ባለ 6 አሃዝ ኮድ ያስገቡ', 'Confirm': 'አረጋግጥ', 'Back': 'ተመለስ',
  'Job cards, workshop clocks, parts stock and invoicing for': 'የሥራ ካርዶች፣ የአውደ ጥገና ሰዓት መቆጣጠሪያ፣ የመለዋወጫ ክምችትና ደረሰኞች ለ',
  // common buttons and words
  'Save': 'አስቀምጥ', 'Cancel': 'ይቅር', 'Delete': 'ሰርዝ', 'Close': 'ዝጋ', 'Print': 'አትም', 'Copy': 'ቅዳ', 'Copied': 'ተቀድቷል', 'Edit': 'አርም', 'Add': 'ጨምር', 'Search': 'ፈልግ', 'Yes': 'አዎ', 'No': 'አይ',
  'Customer': 'ደንበኛ', 'Vehicle': 'ተሽከርካሪ', 'Plate no': 'የሰሌዳ ቁጥር', 'Phone': 'ስልክ', 'Name': 'ስም', 'Date': 'ቀን', 'Total': 'ጠቅላላ', 'Subtotal': 'ንዑስ ድምር', 'Labour': 'የሥራ ዋጋ', 'Parts': 'መለዋወጫ',
  'Description': 'መግለጫ', 'Qty': 'ብዛት', 'Unit price': 'የአንዱ ዋጋ', 'Amount': 'መጠን', 'Hours': 'ሰዓት', 'Status': 'ሁኔታ', 'Note': 'ማስታወሻ', 'Notes': 'ማስታወሻዎች', 'Terms and conditions': 'ደንቦችና ሁኔታዎች',
  'VAT': 'ተ.እ.ታ', 'Draft': 'ረቂቅ', 'Issued': 'ተሰጥቷል', 'Approved': 'ጸድቋል', 'Declined': 'ተቀባይነት አላገኘም', 'Pending': 'በመጠባበቅ ላይ', 'Expired': 'ጊዜው አልፏል',
  // language and currency
  'Language': 'ቋንቋ', 'Currency': 'ገንዘብ', 'Currency code': 'የገንዘብ ኮድ', 'Language and currency': 'ቋንቋና ገንዘብ', 'Currency saved.': 'የገንዘብ ኮዱ ተቀምጧል።',
  'Shown on every price, estimate, invoice and report. For example ETB or USD.': 'በእያንዳንዱ ዋጋ፣ ግምት፣ ደረሰኝና ሪፖርት ላይ ይታያል። ለምሳሌ ETB ወይም USD።',
  // two-step sign-in
  'Two-step sign-in': 'የሁለት ደረጃ መግቢያ', 'On': 'በርቷል', 'Off': 'ጠፍቷል', 'Set up two-step sign-in': 'የሁለት ደረጃ መግቢያን አዘጋጅ', 'Turn on': 'አብራ', 'Turn off': 'አጥፋ',
  'Secret key': 'ሚስጥራዊ ቁልፍ', 'Open in authenticator app': 'በአውቲንቲኬተር መተግበሪያ ክፈት', 'Code from the app': 'ከመተግበሪያው የተገኘ ኮድ',
  'Install an authenticator app (Google Authenticator, Microsoft Authenticator or Authy), add a new account with "Enter a setup key", type the key below, then write the 6-digit code it shows.': 'አውቲንቲኬተር መተግበሪያ (Google Authenticator፣ Microsoft Authenticator ወይም Authy) ይጫኑ፣ "Enter a setup key" በመምረጥ አዲስ መለያ ይጨምሩ፣ ከታች ያለውን ቁልፍ ያስገቡ፣ ከዚያም የሚያሳየውን ባለ 6 አሃዝ ኮድ ይጻፉ።',
  'Two-step sign-in is on. Signing in needs your password and a code from your phone.': 'የሁለት ደረጃ መግቢያ በርቷል። ለመግባት የይለፍ ቃልዎና ከስልክዎ ኮድ ያስፈልጋል።',
  'Turn on two-step sign-in for your account (Staff screen).': 'ለመለያዎ የሁለት ደረጃ መግቢያን ያብሩ (ሠራተኞች ገጽ)።', 'Reset two-step': 'የሁለት ደረጃ መግቢያን አጽዳ',
  // approval by link
  'Customer approval': 'የደንበኛ ማጽደቂያ', 'Make approval link': 'የማጽደቂያ ሊንክ ፍጠር', 'Make a new link': 'አዲስ ሊንክ ፍጠር', 'Withdraw link': 'ሊንኩን ሰርዝ', 'Send by Telegram': 'በቴሌግራም ላክ', 'Send by SMS': 'በኤስኤምኤስ ላክ',
  'The customer opens the link on his phone, sees exactly what is on this document, and approves or declines it. The link works for 14 days. If you change the document, make a new link.': 'ደንበኛው ሊንኩን በስልኩ ከፍቶ በዚህ ሰነድ ላይ ያለውን በትክክል ይመለከታል፣ ከዚያም ያጸድቃል ወይም አይቀበልም። ሊንኩ ለ14 ቀናት ይሠራል። ሰነዱን ከቀየሩ አዲስ ሊንክ ይፍጠሩ።',
  'Approved by': 'ያጸደቀው', 'Declined by': 'ያልተቀበለው', 'Waiting for the customer': 'ደንበኛውን በመጠባበቅ ላይ', 'Replaced by a newer link': 'በአዲስ ሊንክ ተተክቷል', 'No approval link yet.': 'እስካሁን የማጽደቂያ ሊንክ የለም።',
  'Please check the estimate': 'እባክዎ ግምቱን ይመልከቱ', 'Your name': 'ስምዎ', 'Comment (optional)': 'አስተያየት (አማራጭ)', 'Approve': 'አጽድቅ', 'Decline': 'አልቀበልም',
  'Thank you. Your approval was received. The garage will start the work.': 'እናመሰግናለን። ማጽደቂያዎ ደርሷል። ጋራዡ ሥራውን ይጀምራል።', 'Your answer was received. The garage will contact you.': 'መልስዎ ደርሷል። ጋራዡ ያነጋግርዎታል።',
  'This link is not valid.': 'ይህ ሊንክ ትክክል አይደለም።', 'This link has expired. Ask the garage for a new one.': 'የዚህ ሊንክ ጊዜ አልፏል። ከጋራዡ አዲስ ይጠይቁ።', 'Loading…': 'በመጫን ላይ…',
  // inspection and photos
  'Reception inspection and photos': 'የመቀበያ ፍተሻና ፎቶዎች', 'Fuel level': 'የነዳጅ መጠን', 'Existing damage (scratches, dents)': 'አስቀድሞ ያለ ጉዳት (ጭረት፣ ሞለጭ)', 'Valuables left in the car': 'በመኪናው ውስጥ የተተዉ ዋጋ ያላቸው ዕቃዎች', 'Keys handed over': 'የተሰጡ ቁልፎች',
  'Inspection saved.': 'ፍተሻው ተቀምጧል።', 'Save inspection': 'ፍተሻውን አስቀምጥ', 'Take or choose photos': 'ፎቶ አንሳ ወይም ምረጥ', 'Photo type': 'የፎቶ ዓይነት', 'photos': 'ፎቶዎች', 'No photos yet.': 'እስካሁን ፎቶ የለም።',
  'Inspected by': 'የፈተሸው', 'OK': 'ደህና', 'Problem': 'ችግር አለ', 'N/A': 'አይመለከትም', 'Uploading…': 'በመጫን ላይ…',
  'Front': 'ፊት', 'Rear': 'ኋላ', 'Left side': 'ግራ ጎን', 'Right side': 'ቀኝ ጎን', 'Interior': 'ውስጥ', 'Damage': 'ጉዳት', 'Dashboard': 'ዳሽቦርድ', 'Other': 'ሌላ',
  'Body: front': 'አካል፡ ፊት', 'Body: rear': 'አካል፡ ኋላ', 'Body: left side': 'አካል፡ ግራ ጎን', 'Body: right side': 'አካል፡ ቀኝ ጎን', 'Windscreen and glass': 'የፊት መስታወትና መስኮቶች', 'Lights': 'መብራቶች', 'Tyres': 'ጎማዎች', 'Spare wheel': 'ሬዛርቭ ጎማ',
  'Mirrors': 'መስታወቶች', 'Wipers': 'መጥረጊያዎች', 'Dashboard warning lights': 'የዳሽቦርድ ማስጠንቀቂያ መብራቶች', 'Seats and interior': 'መቀመጫዎችና የውስጥ ክፍል', 'Radio / AC': 'ሬዲዮ / ማቀዝቀዣ', 'Jack and tools': 'ጃክና መሣሪያዎች', 'Oil and fluid levels': 'የዘይትና ፈሳሾች መጠን'
};
export const t = s => (lang === 'am' && AM[s]) || s;
