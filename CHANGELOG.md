# Izmaiņu žurnāls

## 1.44.0 — 2026-11-22
- 🗣️ Latviešu balsis: dzīvnieki runā! Takas draugi (🐻 🐿️ 🦔 🦫 🦊) izsaka savus lūgumus, padomus un pateicības, katram sava balss
  (lācis dziļa, vāverīte smalka). Tirgus pārdevēji sasveicinās, kaķis Kārlis autobusā paziņo pieturas, sacīkstēs „Trīs, divi, viens, aiziet!”,
  stāstnieks — jauns līmenis, izpildīts uzdevums, ceļš brīvs, neizdevies uzdevums.
- Balsis ierakstītas ar Piper TTS (latviešu balss „Aivars”, CC0) — `tools/voices.py`, faili `assets/voice/` (ielādē tikai, kad vajag).
- ⚙️ Iestatījumos 🗣️ Balsis — ieslēgt/izslēgt.
## 1.43.0 — 2026-11-21
- 🌳 Piedzīvojumu taka vairs nav visur vienāda — 8 posmi, katram savi koki, pamežs un zemes krāsa, pie posma sākuma zīme un paziņojums:
  jauktais mežs, 🌿 bērzu birzs (gaišas pļavas, papardes, puķes), 🌲 egļu biezoknis (sūnu ciņi, mušmires), 🌳 veco ozolu birzs,
  🐸 purvs (ūdens acis, niedres, spilves, ūdensrozes; taka pa koka laipu), 🦫 bebru strauts, 🌲 priežu sils (virši, smilšaina zeme), 🏖️ jūrmala.
- ⛰️ Kalnos klinšu tunelis (~40 m) ar koka balstiem un laternām; kamera paliek tunelī.
- 🚧 Šķēršļi uz takas, kas jānovāc visiem kopā: 3 nogāzti koki (🪓 10 sitieni), akmeņu nogruvums tuneļa priekšā (⛏️ 12), ērkšķu biezoknis (✂️ 8).
  Saimnieks skaita sitienus (`tHit`), virs šķēršļa — cik vēl; novākts paliek līdz piedzīvojuma sākšanai no jauna. Šķēršļi ir stāvās aizās — apiet nevar
  (tikai ar ļoti garu kāpienu pāri kalniem). Kartē redzami nenovāktie šķēršļi un tunelis.
- 🌊 Bebru strauts lokās kā čūska (2 viļņi, platums mainās), krastos niedres, ūdensrozes, akmeņi ūdenī, bebru mītne un apgrauzti celmi.
- 🐸 Dzīvnieki (katram spēlētājam savi, parādās ap tevi): vardes (lec, kurkst, ielec ūdenī), pīles strautā, zaķi un stirnas (ganās, aizbēg),
  stārķi purvā, tauriņi pļavās.
## 1.42.0 — 2026-11-21
- ❌ Piedzīvojumu takas uzdevums var neizdoties: ja pēc uzdevuma pieņemšanas **visi** spēlētāji aiziet no uzdevuma vietas
  (pļava ap meža draugu ar visiem priekšmetiem, +30 m) vai uz citu zemi ilgāk par 4 s, uzdevums neizdodas — visiem paziņojums,
  savāktais atgriežas vietās, nesamie izkrīt. Uzdevumu var sākt vēlreiz pie tā paša drauga. Kad tu pats aizej no vietas — brīdinājums.
## 1.41.1 — 2026-11-21
- 🪨 Piedzīvojumu meža lielajiem akmeņiem un klintīm tagad ir akmens faktūra (zemākā grafikā — zīmēta, augstākā — foto, kā meža akmeņiem), sūnas augšpusē.
## 1.41.0 — 2026-11-21
- 🐞 **Kļūdas vieta** (☰ izvēlnē): spēlējot kopā, jebkurš var saglabāt vietu, kad redz kļūdu — tiek pierakstīts, kur stāv visi spēlētāji
  (zeme, precīza vieta, virziens), ko kurš nes, cik tālu ir piedzīvojumu taka, un konsoles kļūdas. Var pierakstīt, kas notika.
  "📋 Kopēt aprakstu" — teksts izstrādātājam. Pēc labojuma saimnieks nospiež "▶ Turpināt no šejienes" — visi (pēc vārda) tiek pārcelti
  atpakaļ uz savām vietām, taka atjaunota, nesamie atkal rokās. Vietas paliek saglabātas arī pēc lapas pārlādes (pēdējās 10).
## 1.40.0 — 2026-11-21
- 🐍 Piedzīvojumu meža taka tagad lokās kā čūska (~2,5 km): cieši līkumi visā garumā, taisnāka tikai pie meža draugiem, tilta, ieejas un jūras.
- ⛰️ Kalnaini apgabali starp meža draugiem (kores līdz ~35 m): taka kāpj kalnos un iet pa aizām ar stāvām akmens kraujām abās pusēs,
  gar malām lieli laukakmeņi un klintis, citur cieša koku rinda. Pa stāvām kraujām uzkāpt nevar — jāiet pa taku.
- 🌿 Meža draugi stāv līdzenās pļavās (uzdevumu vietas — līdzenas).
## 1.39.0 — 2026-11-21
- 🧭 Jauna dienvidu zeme **Piedzīvojumu mežs** (kāpu vietā) — 630 × 1260 m, 2× lielāka par citām zemēm (eksperiments): pakalni, biezs mežs
  (egles, priedes, bērzi, ozoli, krūmi, papardes), līkumota ~2 km taka no sētas robežas līdz jūrai, strauts gravā, pludmale ar būdiņu un laivu, jūra ar putām.
- 🤝 Kopīgs piedzīvojums visai komandai: 5 divkājaini meža draugi pa taku ar uzdevumiem — 🐻 malka šķūnītī, 🐿️ rieksti, 🦔 āboli grozā,
  🦫 dēļi tiltam (strautu var šķērsot tikai pa uzbūvēto tiltu), 🦊 gliemežvāki pludmalē. Nākamais uzdevums atveras, kad iepriekšējais izpildīts;
  progress kopīgs (saimnieks to glabā), redzams joslā, kartē un burbuļos. Balva katram šajā zemē: 🪙 + ⭐; beigās ⚓ Jūrnieka cepure. Taku var sākt no jauna.
- 🐿️🦔🦫 Jauni tēlu modeļi: vāvere (liela cekulaina aste), ezis (adatas mugurā un pakausī), bebrs (plakana aste).

## 1.38.0 — 2026-11-20
- 🎏 Tirgus karodziņu virtenes — atkal iepriekšējais izskats.
- 🪧 Ceļa rādītājā krustojumā atkal redzami virzienu uzraksti (teksts bija paslēpts dēļa iekšā).
- 🦆 Pīle atkal valkā kreklu (arī rakstainos), šalles vietā; spārniem īsas piedurknes.

## 1.37.0 — 2026-11-20
- 🧸 Jauni 3D modeļi (dizaina AI komplekts `js/assets.js`): spēlētāju dzīvnieki, cepures, drēbes, meža dzīvnieki un mājdzīvnieki
  (mazuļi), kartingi, mašīna, ragavas, velosipēds, autobuss, tirgus būdas un ratiņi, dārza mājiņa, siltumnīca, vārti, ceļa rādītājs
  un zīmes, autobusa pietura, visas dārza kultūras, augļu koki, ogu krūmi, sēnes, rotājumi, makšķere, zvaigzne, sirds, kartes rullis.
- ⚡ Viens kopīgs materiāls un katrs objekts — viens tīkls: zīmēšanas izsaukumu ~2× mazāk (sēta 705 → 291, tirgus 825 → 381).
- 🌬️ Augi un krūmi šūpojas vējā (šeiderī, bez CPU darba).
- Pārdevēji (ūdrs, āpsis, pūce, bebrs), koki mežā un ziemas zemes objekti paliek iepriekšējie.

## 1.36.0 — 2026-11-19
- 🌱 Dārznieka līmeņi divreiz vairāk: 24 (bija 12). Katrā jaunajā līmenī jauna kultūra ar savu 3D augu un attēlu:
  13. sparģelis, 14. baklažāns, 15. roze, 16. ananāss, 17. zemesrieksti, 18. čili pipari, 19. magone, 20. vīnogas (uz režģa),
  21. ✨ zelta burkāns (mirdz), 22. 🎃 milzu ķirbis, 23. 🌈 varavīksnes zieds, 24. ⭐ zvaigžņu auglis.
- 🌳 4 jauni augļu koki: valrieksts (15.), citronkoks (17.), apelsīnkoks (19.), zelta ābele (22.) — ar saviem augļiem tirgū.

## 1.35.0 — 2026-11-19
- 🏷️ Vārdi virs spēlētājiem, robotiem un mājdzīvniekiem — mazi, vienkārši uzraksti (balts teksts ar tumšu apmali, bez burbuļa);
  arī lidojošie "+🪙" uzraksti mazāki.
- 💬 Paziņojumi — mazs teksts, caurspīdīgs fons; parādās un pamazām izgaist (īsiem tekstiem ātrāk), netraucē pieskārieniem.
- 🌱 Dārzā vairāk ko audzēt: 8 jaunas kultūras — spināti (2. līm.), ķiploks (3.), tulpe (4.), pupas (5.), brokolis (6.), kabacis (7.),
  rabarbers (8.), melone (10.) — katrai savs 3D augs un attēls; 2 jauni augļu koki — aprikoze (11.) un persiks (12.) ar saviem augļiem.

## 1.34.0 — 2026-11-19
- 🔊 Skaņas visiem transportiem — dzirdamas arī telefona skaļrunī. Ierakstītie dzinēji bija tikai dziļajos basos (< 150 Hz), ko
  telefons neatskaņo, tāpēc mašīna, kartings un autobuss bija klusi. Tagad dzinēji tiek **sintezēti** (harmonikas, rūkšana,
  tonis pēc ātruma, skaņa pēc gāzes): 🚙 mašīna, 🏎️ kartings, 🚌 autobuss (arī ārpusē — tālumā klusāk), draugu mašīnas un kartingi.
  🚲 Velosipēds — riepu/ķēdes šņākoņa un brīvgaitas klikšķi, 🛷 ragavas un ⛷️ slēpes — sniega šņākoņa; vējā arī gaisīga šalkoņa.
- 🎚️ Visām ierakstītajām skaņām nogriezti dziļie basi un izlīdzināts skaļums — telefonā skaidrākas; lēciens/mešana — gaišāka skaņa,
  sacīkšu starts — zvans.

## 1.33.0 — 2026-11-19
- 🏎️ Gludāka kartinga braukšana: maksimālais ātrums vairs nelec 22 ↔ 12 pie trases malas (mainās gludi pēc attāluma), barjera
  bremzē pēc trieciena leņķa un, slīdot gar malu, kartu maigi pagriež gar trasi (agrāk ātrums kritās katrā kadrā), mīksta stūrēšana,
  augstums un slīpums bez trīces, kamera bez lēcieniem (arī tuneļos).
- 🔊 Kartinga skaņa: dzinējs skaļāks ar gāzi, tonis pēc ātruma un turbo; riepu šņākoņa asos pagriezienos un gar barjeru.
- 🚲 Velosipēds: pēdas precīzi uz pedāļiem visā aplī (kāju IK), bērnu izmēra rāmis (zemāks sēdeklis, augstāki pedāļi), lai kājas sniedzas;
  riteņi vairs neieiet zemē (kalnā augšup bez nokavēšanās, neliels pacēlums).

## 1.32.0 — 2026-11-19
- 🚌 „Iekāpt autobusā” parādās tikai ~4 m no autobusa malas (agrāk līdz ~19 m no tā vidus).
- 🚶 Pēc izkāpšanas tajā pašā autobusā uzreiz atkal iekāpt nevar — vispirms jāaiziet prom (tālāk par ~4,5 m) un jānāk atpakaļ
  (vai jāgaida nākamais autobuss). Vairs nevar nejauši iekāpt atpakaļ, spiežot dzelteno pogu.

## 1.31.0 — 2026-11-19
- 🔊 **Īstas skaņas** (CC0 no OpenGameArt / Kenney, 57 skaņas, 1,5 MB): soļi pēc virsmas (zāle, ceļš, sniegs, koka laipa, ūdens),
  vide (putni sētā un mežā, vējš ziemā un kāpās, ūdens pie ezeriem, sienāži un vardes purvā, uguns pie ugunskura),
  dzinēji (kartings, mašīna, autobuss — tonis pēc ātruma), velosipēda spieķi un zvaniņš, ragavu/slēpju šņākoņa, autobusa durvis un zvaniņš.
  Darbības: koka ciršana un krišana, akmens kalšana, uzaršana, sēšana, laistīšana, raža, augļi, makšķere (metiens, pludiņš, šļaksts),
  pirkšana, dāvanas, drēbes, lāde, aka, sniega pikas; melodijas uzvarai, zvaigznei, uzdevumam, līmenim. Pogu klikšķi, logu atvēršana.
  Skaņas, kas skan kaut kur pasaulē, ir klusākas tālumā un skan no pareizās puses (stereo).
- ⚙️ Iestatījumos: 🔊 Skaņa — skaļi / vidēji / klusi / izslēgta.
- 🗺️ Liela karte 16:9 visā ekrānā; pogas un apzīmējumi uz kartes; var tālināt līdz visai zemei un bīdīt.
- 🚶 Noņemta teleportēšanās („Uz manu sētu”, „Ciemos”) — pie draugiem nokļūst kājām vai ar transportu.

## 1.30.0 — 2026-11-19
- ✨ Moderns sākuma ekrāns: zila debess ar sauli un peldošiem mākoņiem, zaļi pakalni ar eglēm, matēta stikla kartīte,
  jauns logotips, soļu indikators (vārds → tēls → istaba), lielas gradienta pogas, koda lauks un „Pievienoties” vienā rindā.

## 1.29.0 — 2026-11-19
- 🐾 Mājdzīvnieks tagad brauc līdzi **visos** transportos: autobusā (sēž ejā blakus tavam sēdeklim), kartingā (aizmugurē virs motora)
  un ziemas pacēlājā (krēslā blakus), tāpat kā mašīnā, ragavās un velosipēdā. Arī draugu mājdzīvnieki.
- 🚌 Autobusa braukšana gluda kā sviests: virziens tiek interpolēts starp maršruta punktiem (agrāk mainījās lēcienos ik metru),
  autobusam savs gluds pulkstenis (kopīgā laika trīce vairs neraustī), mīksts augstums, slīpums un sasvēršanās līkumos pēc ceļa izliekuma.
- ☰ Jauna, skaista izvēlne ar krāsainām flīzēm: 📖 Pamācība (atsevišķs logs ar atveramām sadaļām), ⚙️ Iestatījumi (pilnekrāns,
  grafika, ātruma mērītājs), 🎒 Soma, 📜 Uzdevumi, 🌱 Mans dārzs, 👥 Istaba, 🗺️ Karte, 🎲 Spēles, 💾 Saglabāt un 🚪 Iziet.

## 1.28.0 — 2026-11-19
- 🎮 **Vairākas spēles un „🆕 Jauna spēle visiem”**: istabas veidotājs izvēlas, kuru spēli spēlēt — turpināt kādu iepriekšējo
  vai sākt jaunu (ar nosaukumu). Jaunai spēlei var izvēlēties, ko paturēt: 👕 drēbes, cepures, mājdzīvniekus, kartus (pēc noklusējuma),
  🌷 dārza rotājumus, 🪙 monētas. Viss pārējais (dārzs, līmenis, soma, zvaigznes, uzdevumi, zivis…) sākas no nulles.
- 💾 Katram spēlētājam katrai spēlei savs saglabājums; draugi, pievienojoties, automātiski ielādē savu progresu saimnieka izvēlētajai
  spēlei (ja tajā vēl nav bijuši — sāk no sākuma). Iepriekšējo spēļu progress nekad netiek dzēsts. Spēles nosaukums un #kods — pogā 👥.
  Kopīgās mašīnu vietas un nedēļas mērķis arī katrai spēlei savi. Saglabājumi pirms 1.28.0 = „Pirmā spēle”.

## 1.27.0 — 2026-11-19
- 🌱 **Dārznieka līmenis** (1–12): ⭐ par ražas novākšanu (ilgāk augošas kultūras dod vairāk: burkāns 4⭐, kāposts 13⭐,
  lavanda 33⭐), augļu lasīšanu, zemes uzaršanu (1⭐), koku/akmeņu novākšanu (2⭐) un draugu lauku aplaistīšanu (2⭐).
  Katrā jaunā līmenī: līmenis × 10🪙 un jaunas sēklas. Augšā blakus monētām poga 🌱 ar līmeni un progresa joslu → „Mans dārzs”.
- 🔓 Sēklas atveras pa līmeņiem: 1. burkāns, redīsi, kartupelis · 2. salāti, auzas · 3. sīpols, kvieši · 4. zirņi, tomāts ·
  5. zemene, biete · 6. kāposts, ābele · 7. gurķis, saulgrieze · 8. ķirbis, plūme · 9. kukurūza, bumbiere · 10. paprika, ķirsis ·
  11. arbūzs · 12. lavanda. Tirgū neatvērtās redzamas ar 🔒. Somā esošās sēklas var iesēt vienmēr.
- 🏡 **Dārzs aug**: sākumā 6 × 4 lauciņi pie vārtiem (iezīmēts ar mietiņiem un virvi), tad par monētām 8×6 (2. līm., 30🪙), 10×8 (3., 60🪙),
  12×10 (4., 100🪙), 14×12 (6., 160🪙), 16×14 (7., 240🪙), 18×17 (9., 350🪙), 20×20 (10., 500🪙). Pie robežas — „🏡 Paplašināt dārzu”.
- ⚖️ Jauns līdzsvars: ilgāk augošas kultūras dod daudz vairāk peļņas vienā lauciņā (burkāns +12🪙, tomāts +78🪙, ķirbis +216🪙,
  arbūzs +491🪙, lavanda +611🪙); sēklas dārgākas. Īsās kultūras joprojām labas, ja spēlē bez pārtraukuma, garās — kad spēle aizvērta.
- 💾 Vecie saglabājumi: līmenis aprēķināts pēc jau novāktās ražas, uzartās zemes un nocirstajiem kokiem; dārzs tik liels, lai visi
  esošie lauciņi paliek.

## 1.26.0 — 2026-11-19
- 🚌🚌 Tagad brauc **divi autobusi** pa to pašu apli — otrais pusapli aiz pirmā, tāpēc pieturā jāgaida ne vairāk kā ~4,5 min
  (agrāk ~9,5 min). Pieturā rāda, pēc cik ilga laika atbrauks tuvākais autobuss; kartē redzami abi 🚌.
- 🏡 Pārbaudīts: sētas pieturu nojumes stāv ~14 m aiz vārtiem gar žogu un neaizsedz ieeju sētā (1.24.0 tās stāvēja tieši pie vārtiem).

## 1.25.0 — 2026-11-19
- 🚌 Autobusa maršruts tagad ir liels aplis ar jaunu pieturu **🏁 Sacīkšu trase**: ❄️ Ziemas laukums → 🏡 sēta → 🏁 trase → 🏡 sēta →
  🛒 Mežvidu tirgus → 🏡 sēta → ❄️ Ziema. Jauna pietura arī „Sēta — rietumi”; sētas pieturās nojumes abās ceļa pusēs.
- 🔄 Autobuss vairs negriežas uz vietas: pie Ziemas laukuma, pie sacīkšu trases (blakus stāvlaukumam) un ap Mežvidu tirgu ir
  apļveida grants ceļš — autobuss to apbrauc un brauc atpakaļ pa to pašu ceļu (pa labo pusi). Līkumos tas brauc lēnāk, taisnēs ātrāk.
- 🚌 Skaistāks autobuss: riteņu arkas, noapaļots jumts, melna logu josla, balta un dzeltena līnija, priekšā reste, lukturi, numurs,
  spoguļi, stikla durvis ar rāmjiem, riteņu diski. Uzraksts „MEŽVIDU AUTOBUSS” tagad ir starp riteņiem (vairs nekarājas pāri riteņiem).
  Priekšā tablo „1 · Ziema · Sēta · Trase · Tirgus”. Autobusā rāda nākamo pieturu.
- 🛒 Mežvidu tirgus pārbūvēts: bruģēts laukums ar aku, ap to 5 koka tirgus būdas ar svītrainiem jumtiem, koka izkārtnēm, precēm uz
  letes, plauktiem, mucām un kastēm, starp būdām karodziņu virtenes. Pārdevēji stāv aiz letes. Ap tirgu apļveida ceļš ar pieturu,
  guļbūves pārceltas aiz tā, ciemata koka zīme pie ceļa (peldošie uzraksti noņemti).
- 🗺️ Lielo karti var tuvināt ar diviem pirkstiem (līdz 8×) vai pogām ➕ ➖ un bīdīt ar vienu pirkstu; tuvinot zemes karte kļūst
  detalizētāka, redzami pieturu nosaukumi.

## 1.24.0 — 2026-11-18
- 🚌 Zilais Mežvidu autobuss visu laiku brauc no ❄️ Ziemas laukuma pa ceļu caur sētu līdz 🛒 Mežvidu tirgum, tur apgriežas
  un brauc atpakaļ — un tā bez apstājas. Vada 🐱 kaķis Kārlis ar beisbola cepuri. Autobusam caurspīdīgi logi (redz pasažierus),
  12 sēdvietas, durvis, kas pieturā atveras, maršruta tablo „Ziema ⇄ Tirgus”.
- 🚏 4 pieturas ar nojumi, soliņu un zilu autobusa zīmi (SVG): Ziemas laukums, Sēta — ziemeļi, Sēta — austrumi, Mežvidu tirgus.
  Pieturā redzams, pēc cik sekundēm atbrauks autobuss.
- Iekāpt un izkāpt var tikai pieturā, kamēr autobuss stāv. Brauciens maksā 2🪙. Pasažieri pārbrauc no zemes uz zemi kopā ar autobusu,
  draugi redz tevi sēžam autobusā. Kartē redzams 🚌 un pieturas 🚏.
- Autobusa kustība izriet no kopējā pulksteņa — visi spēlētāji redz to vienā un tajā pašā vietā.

## 1.23.0 — 2026-11-18
- 🏁 Sacīkšu trasei abās pusēs barjeras: vietām riepu kaudzes (melnas vai sarkanbaltas), vietām koka žogs, vietām siena ķīpas
  (dažviet divās kārtās) — mainās nejauši gar visu trasi. Ar kartu vairs nevar izbraukt no trases (tikai trase un starta laukums),
  atsitoties pret barjeru, karts piebremzē. Bērns trasē neapmaldīsies.
- 🛣️ Ceļš no sētas uz trasi vairs nekāpj pāri lielam kalnam — tas ir līdzens visu ceļu (plašā ielejā) līdz pat trasei.
- 🅿️ Ceļa galā grants stāvlaukums mašīnām un velosipēdiem ar baltām stāvvietu līnijām, koka apmalēm un parastā izmēra zilu
  „P” zīmi (zīmēta SVG). Tur gaida 2 velosipēdi (melns un sudraba).
- 🏎️ Kartu starta vieta tagad labi redzama: liels balts aplis ar rūtotu malu, uzrakstu START, pulsējošu dzeltenu gaismas apli,
  gaismas stabu un diviem plīvojošiem rūtotiem karodziņiem; ap to sarkanbaltu riepu žogs.
- 🏆 Blakus — goda pjedestāls ar 1., 2. un 3. vietas pakāpieniem (zelts, sudrabs, bronza), uz tiem var uzkāpt.

## 1.22.0 — 2026-11-18
- ⏳ Sākuma ielāde notiek pa soļiem ar joslu un procentiem (mežs, sēta, karte, tēls, grafika). Starp soļiem ekrāns tiek pārzīmēts,
  tāpēc, pagriežot telefonu ielādes laikā, ekrāns vairs nepaliek melns — ielāde redzama arī guļus. Grafikas sagatavošana un pirmie
  kadri notiek vēl zem ielādes ekrāna (spēle neuzsalst pirmajā brīdī).
- 🚲 8 velosipēdi: pa vienam pie katras sētas vārtiem (4) un 4 velosipēdu statīvā meža ciemata tirgū. Katram sava krāsa,
  ar katru var braukt ikviens, un tas paliek tur, kur atstāts. Krustojuma velosipēds pārcelts pie 1. sētas vārtiem.
- 🍦 Bebrs Bruno tagad lēnām stumj saldējuma ratiņus uz priekšu (rokas uz rokturiem), staigā pa līkumotu apli ap aku, laiku pa laikam
  apstājas un pamāj garāmgājējiem. Kad kāds stāv pie ratiņiem (pērk), viņš stāv uz vietas.

## 1.21.0 — 2026-11-17
- 🚙 Draugu mašīnas brauc gludi: katrai pozīcijai līdzi nāk laiks, saimnieks to uzreiz pārsūta pārējiem (agrāk gaidīja līdz 100 ms),
  braucot pozīciju sūta 20× sekundē, un draugus rāda ~0,1–0,2 s pagātnē, vienmērīgi pārvietojoties starp saņemtajiem punktiem
  (interpolācija; īsi pārtraukumi tiek aizpildīti ar ātrumu). Nav raustīšanās un lēcienu.
- 🚙🚙🚲 Transports tagad ir viens vienīgs visā pasaulē un kopīgs visiem: sētas krustojumā 2 mašīnas (zaļa un zila) un jauns
  **velosipēds** (ar groziņu, kurā var braukt mājdzīvnieks); 🛷 sniega motocikls Ziemas zemē. Ar jebkuru var braukt ikviens, ja neviens
  cits ar to nebrauc; izkāpjot tas paliek tur, kur atstāts (arī citā zemē), un to var paņemt kāds cits. Vairs nav „kopiju” stāvvietās.
  Saimnieks atceras, kur stāv transports (arī nākamajā spēlē). Kartē redzams, kur ir katra mašīna.
- 🗺️ Minikarte griežas līdzi: tu vienmēr centrā, bulta uz augšu, sarkanais **N** rāda ziemeļus. Pieskaroties — liela karte (gandrīz
  viss ekrāns) ar tavas zemes detaļām (tirgotāji, aka, sētu īpašnieki, transports, visi spēlētāji ar vārdiem un virzienu);
  poga „🧭 Visas zemes” — visa pasaule; pieskaries zemei, lai to redzētu tuvāk. Karte atjaunojas dzīvajā.
- 👕 Drēbes: Pūce Paula tagad pārdod arī kreklus (svītrains, rūtains, futbola, ar zvaigznēm, Latvijas), brilles (saulesbrilles,
  apaļās, sirsniņu), tauriņu, kaklasaiti, pērļu krelles, zelta medaļu, mugursomu, varoņa apmetni, tauriņa spārnus, gumijas zābakus,
  kedas un 4 jaunas cepures (beisbola, berete, kovboja, pirāta). Draugi redz tavas drēbes.
- 🎒 Jauna soma: augšā tavs tēls (īsts 3D attēls, var pagriezt) ar 6 drēbju vietām — pieskaries vietai un izvēlies, ko uzvilkt;
  zemāk visu lietu režģis ar attēliem un skaitu; pieskaroties lietai — apraksts un darbības (sēt, stādīt, novietot, uzvilkt, dāvināt).
- 🎁 Dāvanas: somā jebkuru lietu, zivis, drēbes vai monētas var uzdāvināt draugam istabā.
- 🖼️ Katrai precei savs zīmēts attēls (SVG): katra kultūra, sēklu paciņa ar attiecīgo dārzeni, stādi, augļi, sēnes, ogas, zivis,
  katra cepure un drēbe, rotājumi, mājdzīvnieki, makšķere — vairs nav vienādu emocijzīmju.
- 🌱 10 jaunas kultūras: redīsi (45 s), salāti, sīpoli, zirņi, bietes, gurķi, kukurūza (1,5 h), paprika (2 h), arbūzi (3 h), lavanda (4 h).
- 🌳 Augļu koki: ābele, bumbiere, ķirsis, plūme. Stādu iestāda uz uzarta lauciņa, tas izaug (2–3 h; aplaistīts ātrāk) un tad ik pa
  30–40 min dod augļus (āboli, bumbieri, ķirši, plūmes), ko var pārdot.
- 🤲 Rotājumus var pārnest: savā sētā pie rotājuma „🤲 Pacelt” — tēls to nes rokās; „📍 Novietot” noliek tur, kur skaties.
  Nopirktie rotājumi nonāk somā — sētā tos izņem un novieto kur gribi. 3 jauni rotājumi: dārza sēne, mazās vējdzirnavas, ziedu dobe.
- 🪙 Vēlēšanās aka meža ciemata vidū: iemet 5🪙 — dažreiz izkrīt sēklas, monētas, rotājums, koka stāds vai drēbe… bet dažreiz nekas.
- 🎣 Noķerot zivi, ekrānā liels zivs attēls ar garumu, svaru un cenu; lielāka zivs — dārgāka. Jaunas zivis: karpa un rets sams.
  Somā redzamas visas zivis ar izmēriem, sasniegumos — rekordi.
- 💾 Vecie saglabājumi pārnesti: zivis kļūst par vidēja izmēra zivīm, rotājumi paliek savās vietās, noņemtie — somā.

## 1.20.0 — 2026-11-17
- 🏡 Sēta pārbūvēta: krustojuma 4 stūros 4 vienādas iežogotas sētas (72 × 72 m). Katrā — dārzs 20 × 20 lauciņi (kvadrāts,
  paralēls ceļiem), sarkana dārza mājiņa, kurā var ieiet (iekšā jumts paslēpjas un sienas kļūst caurspīdīgas), stikla siltumnīca
  ar tomātu dobēm un pagalms rotājumiem. Žogi un sienas ir cieti — sētā ieiet pa vārtiem abās ceļa pusēs.
  Ceļi pie sētām tagad taisni, tālāk — līkumoti kā agrāk. Apkārt pļava ar retiem kokiem un mežs.
- 🪧 Jaunas, mazākas un skaistākas zīmes: vārtu arkā karājas koka dēlis ar iededzinātu īpašnieka vārdu; krustojumā ~3 m augsts
  koka ceļa rādītājs ar 4 bultām; katrā ceļā 100 m no krustojuma brūna ceļa zīme („❄️ Ziemas zeme 215 m”, otrā pusē „🏡 Mežvidu sēta 100 m”).
  Peldošie uzraksti sētā noņemti.
- 💾 Vecie dārzi pārnesti: lauciņi, kas iekļaujas jaunajā dārzā, paliek; pārējie noņemti, un raža / sēklas atdotas somā.
  Novācamie koki un akmeņi dārzā sākas no jauna.
- 👥 „Ciemos” tagad atved pie drauga sētas galvenajiem vārtiem.

## 1.19.1 — 2026-11-17
- 🎨 Auto grafika vairs nebloķē līmeni uz 2 dienām. Ja pēc uzlabošanas fps nokrītas zem 40, Auto atgriežas zemāk un to pašu
  līmeni mēģina atkal pēc 30 s, tad 1 min, 2 min, 4 min (ne retāk kā ik 5 min) — īslaicīgs lēnums vairs neliedz labāku grafiku.
  Vecās 2 dienu bloķēšanas tiek izdzēstas.

## 1.19.0 — 2026-11-17
- ⚡ Ātrāka grafika vājākiem telefoniem. Mērījums (tās pašas 7 vietas visās zemēs, pirms → pēc):
  Viszemākā un Zemā grafika zīmē ~1,5× ātrāk (kadra laiks −35 % / −33 %), trijstūru −25 % / −37 %;
  Vidējā un Augstā — par ~20 % mazāk trijstūru (ātrums apmēram tāds pats — tur galvenais darbs ir foto faktūras un mīkstās ēnas).
  Ziemas zemē trijstūru −43 %.
  - Viszemākā/Zemā: vienkāršots apgaismojums (bez spīduma un vides atspīduma aprēķina) — izskats gandrīz tāds pats, bet lētāks katrs pikselis.
  - Zemā: ēnas pārzīmē ik otro kadru; niedres vairs nemet ēnas.
  - Zemes reljefs tālumā ar 2× retāku režģi; ziemas sniega reljefs sadalīts 200 m gabalos ar 3 detalizācijas līmeņiem (agrāk viens 231 000 trijstūru gabals).
  - Zāle tālumā retāka; vienkāršāki ogu krūmi un dzīvnieku galvas/ķermeņi (~2× mazāk trijstūru); ezera atspulgs tikai tad, kad ūdens redzams, un ik otro kadru.
  - Sētas zīmes apvienotas (mazāk zīmēšanas izsaukumu).
- 📊 Izvēlnē ☰ „Ātruma mērītājs”: ekrāna augšā fps, kadra laiks, zīmēšanas izsaukumi, trijstūri un pikseļi.

## 1.18.0 — 2026-11-17
- 🪧 Sētā īstas koka zīmes ar lieliem burtiem: pie katra lauka abiem vārtiem vārtu arka ar dēli „🏡 <vārds> sēta” (vai „🌾 Brīvs lauks”),
  ko var izlasīt no abām pusēm. Krustojumā augsts ceļa rādītāja stabs ar 4 krāsainām bultām, kas rāda katra ceļa virzienu
  (❄️ ziema, 🌲 mežs un tirgus, 🏁 trase, 🏖️ kāpas). „Mežvidu sēta” uzraksts virs krustojuma lielāks.

## 1.17.0 — 2026-11-16
- ⛷️ Ziemas kalns 2× lielāks: virsotne ~157 m (bija ~77 m), nobrauciens ~330 m, slīpums tāds pats kā agrāk. Pacēlājs garāks
  un ātrāks (28 krēsli). Aiz ziemeļu žoga kalns lēzeni nolaižas līdz līdzenumam (reljefs plašāks par spēles laukumu).
- 🐰 Trasē slēpo 4 citi slēpotāji (zaķis, lapsa, kaķis, suns): slalomā brauc lejā, aizslīd līdz pacēlājam, brauc augšā un atkal lejā.
  Visi spēlētāji viņus redz vienās vietās.

## 1.16.0 — 2026-11-16
- 🏡 Labots: draugs, kurš pievienojas, uzreiz redz saimnieka lauku (agrāk tas parādījās tikai pēc kādas darbības laukā).
- 🏡 Visi 4 lauki tagad ir vienādi (pagriezti par 90°), un lauks tiek glabāts neatkarīgi no lauka numura — ja istabā tevi ieliek
  citā laukā, tavs lauks parādās tur pilnībā, bez svešiem žogiem pa vidu, un ar visiem augiem var darboties. Lauciņi, kas pēc ceļu
  maiņas palika uz ceļa vai ārpus lauka, noņemti — gatavā raža vai sēklas atdotas somā. Koki/akmeņi uz uzartas zemes pazūd.
- 🚙 Atstātā mašīna (vai sniega motocikls) tagad redzama arī draugiem; tieši blakus mašīnai „Sēsties” uzvar citas darbības (piem., aršanu).
- 🏁 Ja kāds sāk sacīkstes, bet tu jau sēdi kartā trasē — tu pievienojies automātiski un starta brīdī esi starta vietā.
- 🎮 Braukšanas vadība: kreisajā pusē ⛽ gāze un 🛑 bremze, labajā ◀ ▶ stūre (kartings, mašīna, sniega motocikls). Kursorsvira tikai kājām.
- 📱 Android pilnekrāna paziņojuma laikā apakšējās pogas uz brīdi paceļas augstāk. Izvēlnē padoms pievienot spēli sākuma ekrānam.
- 🎨 Viszemākā grafika vairs nav izplūdusi: pilna izšķirtspēja, zāle tuvumā, daļa sīko detaļu; ātrumu ietaupa bez ēnām un ar tuvāku miglu.
  Tikai ja telefons joprojām nevelk, Auto nedaudz samazina izšķirtspēju (līdz 85 %).

## 1.15.0 — 2026-11-15
- 🌿 Zāle redzama daudz tālāk (~42 m ap tēlu, nevis ~23 m), un tālumā stiebri pakāpeniski samazinās — zāle vairs „neizaug” pēkšņi priekšā.
- 🐾 Mājdzīvnieks ielec mašīnā (vai sniega motociklā) un brauc līdzi — arī tad, ja brauc līdzi draugam; izkāpjot atkal skrien blakus.
- 🤗 Mājdzīvnieku var paglaudīt reizi 3 minūtēs, un citas darbības (art, sēt, lasīt…) vienmēr ir svarīgākas — poga vairs netraucē.
- 🚙 Mašīna lielāka (×1,2) — ērti 4 braucējiem un mājdzīvniekiem; vairs nemirgo krāsas (salabotas sakrītošas virsmas, precīzāks dziļums).
- 🛣️ Sētas ceļi līkumoti; lauku žogi seko ceļiem. Gar ceļiem bērzu un ozolu rindas ar krūmiem.

## 1.14.0 — 2026-11-15
- 🗺️ Zemes pārkārtotas: **🏡 sēta centrā**, **🌲 Mežvidu mežs austrumos** (viss bijušais Mežvidu mežs ar ciemu, tirgu, sēnēm,
  ogām, dzīvniekiem, īpašajām vietām, zvaigznēm un dārgumu medībām), **🏁 sacīkšu trase rietumos**. Ziemas zeme un kāpas — kā bija.
  Visi sāk sētā (vecā dārza augi atdoti kā sēklas).
- 🏡 **Sēta**: 4 lieli lauki (katram spēlētājam savs, ~260 × 260 m) ar pļavu, dažiem kokiem un akmeņiem, ap sētu meža josla,
  krustojumā ceļa rādītāji uz visām zemēm. Pie katra lauka — zīme ar īpašnieka vārdu un dārza rotājumi.
- 🌾 **Lauksaimniecība**: nocērt kokus (3 cirtieni), novāc akmeņus un krūmus (+🪙), uzar 2,5 m lauciņus (līdz 400),
  sēj, aplaisti (aug 40 % ātrāk) un novāc ražu. Blakus lauciņi ar to pašu kultūru saaug vienā vienmērīgā laukā,
  dažādām kultūrām starp tiem paliek sprauga. Jaunas kultūras: **auzas**, kvieši, kāposti, saulgriezes; augšanas laiki
  no 1 minūtes līdz 1 stundai (ķirbis) — augi aug pēc pulksteņa arī tad, kad spēle aizvērta. Viena sēkla = viens lauciņš.
- 👥 **Ciemos**: istabas panelī (👥) poga „Ciemos” aizved uz drauga sētu (arī no citas zemes), „Uz manu sētu” — mājās.
  Draugu laukus var aplaistīt. Lielajā kartē redzams, kuram kurš lauks.
- 🏎️ **Jauna, garāka trase** (~1,6 km) ar **diviem tuneļiem** cauri pakalniem (gaismas griestos, pa pakalnu var uzkāpt virs tuneļa),
  sacīkstēs 2 apļi.
- Ārējās zemju malās, kur aiz robežas nekā nav, — koka žogs.

## 1.13.0 — 2026-11-15
- 👨‍👩‍👧‍👦 Mašīnā var braukt **4 spēlētāji**: vadītājs un trīs pasažieri (sniega motociklā — divi). Pieej pie drauga
  mašīnas, kad tā stāv vai brauc lēni, un spied **„Braukt līdzi”**. Pasažieris brauc līdzi arī uz citām zemēm;
  kad vadītājs izkāpj, izkāpj arī pasažieri. Mašīnai ir jauns aizmugures sēdeklis.
- 🚙 Gludāka braukšana: mašīna vairs nelēkā augšā–lejā kalnā (augstums un slīpums no visiem četriem riteņiem,
  mīksts „atsperojums”), kamera braucot neraustās, draugu mašīnas kustas gludi (kustība tiek prognozēta starp tīkla ziņām).
  Atsitoties pret koku, var aizbraukt prom, nevis iestrēgt.
- 📱 Ap ekrāna malām vairs nav gaišzilas joslas (spēles attēls aizpilda visu ekrānu, fons aiz tā tumšs).

## 1.12.0 — 2026-11-15
- 🚙 **Mašīna** (atvērts visurgājējs): stāvvieta ciemata malā, katras blakus zemes centrā un pie Ziemas zemes laukuma.
  Pa grants ceļiem brauc ātri (~70 km/h), pa zāli/sniegu lēnāk, kalnā lēnāk, no kalna ātrāk; virsbūve seko reljefam,
  priekšējie riteņi stūrējas, pa ceļu var **aizbraukt uz citu zemi** (mašīna brauc līdzi). Izkāpjot mašīna paliek, kur atstāta.
  Draugi redz tavu mašīnu (tavā kartinga krāsā).
- 🛷 **Sniega motocikls** Ziemas zemē (pie pacēlāja ceļa): brauc pa visu sniegu un uzbrauc kalnā, uz izciļņiem var palekties.
- 📐 Zemes atkal par 50 % lielākas: katrs kvadrāts 630 × 630 m. Vairāk koku, sēņu, ogu, dzīvnieku; ceļi pagarināti.
- ⛰️ Daudz lielāks slēpošanas kalns (~105 m), garāka trase un pacēlājs (trose seko kalna formai).
- ⛷️ Reālistiskāka slēpošana: slēpes guļ uz nogāzes (uz priekšu un sāņus), līkumos slēpotājs sasveras uz iekšu,
  ātrumā dziļāks pietupiens, bremzējot slēpes „arklā”, lēcienā rokas izpletas. Arī draugu slēpotāji seko nogāzei.
- Jauni uzdevumi: aizbrauc ar mašīnu uz citu zemi, pabrauc ar sniega motociklu.

## 1.11.1 — 2026-11-15
- 🐞 Meža dzīvniekus (stirnas, zaķus, ežus, mežacūkas, vāveres, stārķus) atkal var paglaudīt — poga parādījās, bet neko nedarīja
  (metodes nosaukums `pet` sakrita ar paša mājdzīvnieka objektu `this.pet`; tagad `petNpc`).
- Ja kāda darbības poga turpmāk izraisa kļūdu, spēle to parāda paziņojumā, nevis klusi neko nedara.
- Pārbaudītas visas pārējās darbības pogas (sēnes, ogas, tirgotāji, saldējums, dārzs, tornis, lāde, ugunskurs, makšķerēšana,
  karts, mājdzīvnieks, ziemeļbrieži, slēpes, pacēlājs, sniega pikas) — tās strādā.

## 1.11.0 — 2026-11-15
- 📐 Visas zemes ir divreiz mazākas: katrs kvadrāts tagad 420 × 420 m (agrāk 840 × 840 m). Mežvidu īpašās vietas,
  ziemas kalns ar pacēlāju, laukums un piku kaujas laukums pārvietoti, lai viss ietilptu; līdz kaimiņu zemei ātrāk aiziet.
- 🛤️ Grants ceļi: no Mežvidu ciemata uz katru debespusi ved ceļš līdz robežas vidum, un tas turpinās kaimiņu zemē
  (Ziemas zemē — līdz Ziemassvētku laukumam un tālāk līdz pacēlājam; pārējās zemēs — līdz centram, kur ir aplis apgriešanai).
  Ceļi ir pietiekami plati un brīvi no kokiem, lai vēlāk pa tiem varētu braukt ar mašīnu. Ceļi redzami arī kartē.

## 1.10.0 — 2026-11-15
- ❄️ Ziemeļu zeme kļuvusi par **Ziemas zemi**: sniega klajums ar dzirkstošu sniegu, sniegotas eglītes,
  izrotāta Ziemassvētku egle ar dāvanām un ragavām, sniegavīri, slēpotāju namiņš un ziemeļbriežu bari (tos var paglaudīt).
- 🧣 Ziemas zemē tēlam automātiski ir adīta cepure ar bumbuli, dūraiņi un šalle, kuras gali plīvo, ejot un slēpojot.
- ⛷️ Liels slēpošanas kalns ar krēslu pacēlāju: brauc augšā, slēpes kājās, un lejā pa trasi (stūrē, bremzē, lec).
  Slēpot var visi draugi kopā. Slēpes var uzlikt arī pie statīva kalna pakājē.
- ❄️ Sniega piku kaujas laukums ar sniega vaļņiem un cietokšņiem: met pikas draugiem vai sniegavīru mērķiem.
- 🌨️ Laiku pa laikam snieg (visiem vienlaicīgi); sniegputenī redzamība samazinās.
- Jauni uzdevumi: nobrauc no kalna, trāpi ar sniega piku, paglaudi ziemeļbriedi. Karte rāda Ziemas zemes kalnu, trasi un pacēlāju.

## 1.9.0 — 2026-11-15
- 🎨 Četri grafikas līmeņi: Augsta, Vidēja, Zema un jauns **Viszemākā** (bez ēnām, zāles un sīkām detaļām, zemāka
  izšķirtspēja, īsāks redzamības attālums) vājākajiem telefoniem.
- **Auto** (noklusējums): spēle mēra kadru ātrumu un pati pārslēdz līmeni — lēnā telefonā uz leju, jaudīgā telefonā
  uz augšu līdz Augstai. Ja augstāks līmenis neiztur, tas tiek atcelts un uz laiku vairs netiek mēģināts. Līmenis tiek atcerēts.
- Grafika mainās uzreiz, bez pārlādes (☰ izvēlnē: Auto → Augsta → Vidēja → Zema → Viszemākā).

## 1.8.0 — 2026-11-15
- 🧭 Vārtu vairs nav: uz kaimiņu zemi var pāriet pa **jebkuru robežas vietu**. Tuvojoties robežai, ekrānā parādās,
  kura zeme ir aiz tās; ejot tālāk — ielādes ekrāns, jaunā zeme ielādējas un iepriekšējā tiek noņemta.
- Mežvidu malās vairs nav kalnu: zeme aiz robežas pāriet kaimiņu zemes līdzenumā (to redz jau no Mežvidiem); robežu iezīmē sarkanbalti stabiņi.
- Kad esi citā zemē, Mežvidi tiek izņemti no ainas un **visa to grafikas (GPU) atmiņa atbrīvota** — ģeometrijas un faktūras.
  Atgriežoties dati tikai tiek augšupielādēti no jauna (ātri), nevis pasaule ģenerēta vairākas sekundes.
- Ātrāka grafika bez kvalitātes zuduma — ~35–40 % mazāk zīmēšanas izsaukumu:
  ciemats, tirgotāji, īpašās vietas un dārza dobes apvienotas pa materiāliem; sēnes un ogu krūmi instancēti;
  dzīvnieku detaļas ar vienādu izskatu sapludinātas (krāsa, raupjums un metāliskums glabājas virsotnēs).
- Karte joprojām rāda visas zemes kopā un katra spēlētāja vietu.

## 1.7.0 — 2026-11-15
- 🧭 Pasaule tagad ir 5 zemes: Mežvidi centrā (kvadrāts 840 × 840 m) un četras blakus zemes katrā debespusē —
  ❄️ Ziemeļu klajums, 🌻 Austrumu lauki, 🏖️ Dienvidu kāpas, 🌲 Rietumu sils (pagaidām līdzena zeme, saturs nāks vēlāk).
- Mežvidu malās kalnos izcirstas takas ar vārtiem un ceļa rādītājiem; pietuvojoties ekrānā parādās, kurp taka ved.
  Izejot cauri vārtiem, ielādējas jaunā zeme un iepriekšējā tiek noņemta.
- Mežvidu stāvoklis (sēnes, ogas, dārzi, sacīkstes) turpinās arī tad, kad esi citā zemē; spēle atceras, kurā zemē biji.
- Karte rāda visas zemes kopā un katra drauga precīzu vietu; kad draugs aiziet uz citu zemi, parādās paziņojums.
  Istabas sarakstā redzams, kurā zemē katrs ir. Mājdzīvnieks iet līdzi.
- Ķeramo un paslēpes var spēlēt tikai Mežvidos; ar kartu uz citu zemi nevar.

## 1.6.0 — 2026-11-14
- Reālistiskāka grafika: zeme no foto faktūrām (pļava, meža zeme, smiltis, dubļi, akmens), kas dabiski pāriet viena otrā.
- Foto faktūras trases asfaltam, akmeņiem un pilsdrupām.
- Apgaismojums no īstas debesu fotogrāfijas (HDRI).
- Ūdens: koku un mākoņu atspulgi, caurspīdīgs sekls krasts, viegla putu josla.
- Pēcapstrāde: mīkstas ēnas kaktos (apkārtnes aizēnojums), mirdzums, krāsu korekcija, vinjete.
- Grafikas izvēle: Augsta (viss) / Vidēja (foto faktūras bez atspulgiem un efektiem) / Zema. Lēnos telefonos efekti izslēdzas paši.
- Faktūras: Poly Haven (CC0). Nākamās idejas — TODO.md.

## 1.5.0 — 2026-11-14
- 🎣 Makšķerēšana: makšķere pie Ūdra Ojāra, zivis ezeros (rauda, asaris, līdaka, reta zelta zivtiņa), no laipas ķeras labāk.
- 🫐 Ogu lasīšana: mellenes, avenes un dzērvenes.
- 🐾 Mājdzīvnieki, kas seko saimniekam (Suns Sprīdis), 🏡 dārza rotājumi (Lapsa Liene) — tos redz arī draugi.
- 🗺️ 5 īpašās vietas: skatu tornis, ugunskura vieta, purvs ar laipu, pilsdrupas, makšķernieku laipa ar laivu.
- 💰 Dārgumu medības: 3 kartes gabali → lāde pilsdrupās (+150🪙 un bruņinieka ķivere). Pie ugunskura var izcept sēnes.
- ⭐ Zvaigznes kartē parādās pēc uzkāpšanas skatu tornī.
- 🎲 Ķeramais un paslēpes ar draugiem.
- 🤝 Nedēļas kopīgais mērķis, kas mainās katru pirmdienu un saglabājas starp spēlēm.
- 📜 10 jauni uzdevumi.

## 1.4.0 — 2026-11-14
- Pasaule ~2,3 reizes platāka (spēles laukums 840 m diametrā, ~5 reizes lielāka platība):
  vairāk ezeru, mežu, līdzenumu un pauguru apgabalu.
- 420 sēnes, 96 meža dzīvnieki, vairāk akmeņu, ziedu, niedru un ūdensrožu; 15 zvaigznes izkaisītas pa visu pasauli.
- Minikarte rāda apkārtni ap spēlētāju; pieskaroties tai, atveras visa karte.
- Ātrdarbība: tālie koki zīmēti kā vienkārši attēli, sīkas detaļas — tikai tuvumā, reljefs sadalīts flīzēs.

## 1.3.2 — 2026-11-14
- Telefoni vairs nerāda veco versiju no kešatmiņas: visiem failiem ir versijas atzīme, un spēle,
  ja serverī ir jaunāka versija, pati pārlādējas.

## 1.3.1 — 2026-11-14
- Spēles versija redzama sākuma ekrānā (vārda ievadē) un ☰ izvēlnē.
- Atjaunināta dokumentācija (README, CLAUDE.md, šis žurnāls).

## 1.3.0 — 2026-11-14
- Detalizētāki visi objekti: dzīvnieku ķermeņi, ķepas un acis; cepures; kartingi ar riepām un dzinēju;
  tirgotāju ratiņi ar tentu un precēm; sēnes; dārza augi; zvaigznes.
- Kartinga trase: asfalts ar marķējumu, paceltas apmales, riepu barjeras, metāla starta vārti.
- Ezeru malās niedres, vilkvālītes un ūdensrozes; ziedi ar ziedlapām; baltāki mākoņi.

## 1.2.0 — 2026-11-14
- Dabiskāka pasaule: koki no lapu un skuju zariem, vējš, blīva zāle ap spēlētāju.
- Guļbūves ar skaidu jumtiem, akmens aka, laika apstrādāti žogi, augsne dārzos.
- Reālistiski meža dzīvnieki un kažoka faktūra.

## 1.1.0 — 2026-11-14
- Zemāki, maigāki pakalni; reālistiskas debesis, ēnas, ūdens; reālistiskāki dzīvnieki.
- Automātiska grafikas pielāgošana lēniem telefoniem un „Grafika: Augsta/Zema” poga.

## 1.0.0 — 2026-11-14
- Pirmā versija: istabas līdz 4 spēlētājiem, sēnes, dārzi, tirgus, kartinga sacīkstes, meža dzīvnieki, zvaigznes, uzdevumi.
