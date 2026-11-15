# Izmaiņu žurnāls

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
