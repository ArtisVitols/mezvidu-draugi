# 🌲 Mežvidu Draugi 🦊

Kopīga 3D piedzīvojumu spēle telefona pārlūkam līdz 4 draugiem. Viss latviski.

▶️ **Spēlēt:** https://artisvitols.github.io/mezvidu-draugi/

Pašreizējā versija: **1.6.0** (redzama sākuma ekrānā un ☰ izvēlnē). Izmaiņas: [CHANGELOG.md](CHANGELOG.md).

## Kā spēlēt
1. Atver spēles saiti telefonā (vislabāk guļus).
2. Ieraksti vārdu un izvēlies dzīvnieku (lācis, lapsa, zaķis, kaķis, cūciņa, suns, varde, pīle) un krāsas.
3. **Izveidot istabu** — tu kļūsti par saimnieku un saņem 5 burtu kodu. Pogā 👥 ir „Dalīties ar saiti”.
4. Draugi ieraksta kodu un spiež **Pievienoties** (vai vienkārši atver saiti).
5. **Spēlēt vienam** darbojas arī bez interneta.

**Vadība:** kreisā ekrāna puse — kursorsvira, labā puse — kamera (2 pirksti — tuvināt), ⤒ — lēkt, dzeltenā poga — darbība.
Datorā: WASD / bultiņas, atstarpe, E, peles vilkšana.

## Ko var darīt
- 🍄 Lasīt baravikas un gailenes mežā (sarkanās mušmires ir indīgas!)
- 🤝 Nedēļas kopīgais mērķis — katru pirmdienu jauns (sēnes, zivis, ogas, raža, dzīvnieki, sacīkstes); skaitās visu draugu darbi, progress saglabājas
- 🌱 Katram savs dārzs ciematā: stādi, aplaisti (arī draugu dārzus!) un novāc ražu
- 🧺 Tirgus: Ūdrs Ojārs (sēklas, makšķere), Āpsis Arnolds (uzpērk ražu, zivis, ogas), Pūce Paula (cepures, kartinga krāsas), Suns Sprīdis (mājdzīvnieki), Lapsa Liene (dārza rotājumi), Bebrs Bruno ar saldējuma ratiņiem
- 🎣 Makšķerēšana ezeros: kad pludiņš raustās — „VILKT!”. Raudas, asari, līdakas un reta zelta zivtiņa (no laipas ķeras labāk)
- 🫐 Ogas: mellenes mežā, avenes meža malās, dzērvenes purvā
- 🐾 Mājdzīvnieki, kas skrien līdzi: ezītis, zaķēns, vāverīte, mežacūciņa, stirnēns
- 🏡 Dārza rotājumi: rūķis, puķu pods, putnu būrītis, soliņš, laterna, putnubiedēklis, Latvijas karogs, strūklaka — tos redz arī draugi
- 🗺️ Īpašās vietas: 🗼 skatu tornis (no tā kartē redz visas zvaigznes), ⛺ ugunskura vieta (tur var izcept sēnes), 🐸 purvs, 🏰 pilsdrupas, 🎣 makšķernieku laipa
- 💰 Dārgumu medības: savāc 3 kartes gabalus un atver lādi pilsdrupās (+150🪙 un bruņinieka ķivere)
- 🎲 Ķeramais un paslēpes ar draugiem
- 🏎️ Kartinga trase ar turbo bultām — 3 apļu sacīkstes ar draugiem un robotiem
- 🦌 Meža dzīvnieki: stirnas, zaķi, eži, mežacūkas, vāveres, stārķi — tos var paglaudīt
- 🧭 5 zemes: Mežvidi centrā (840 × 840 m) un katrā debespusē sava zeme — ❄️ Ziemeļu klajums, 🌻 Austrumu lauki, 🏖️ Dienvidu kāpas, 🌲 Rietumu sils.
  Pār robežu var pāriet jebkurā vietā (robežu iezīmē sarkanbalti stabiņi); blakus zemes pagaidām ir līdzenas, saturs nāks vēlāk
- 🗺️ Pieskaries minikartei, lai redzētu karti — visas zemes kopā un kur atrodas katrs draugs
- 🌲 Dabiska pasaule: egļu, priežu, bērzu un ozolu meži, kas šūpojas vējā, pļavas ar ziediem, ezeri ar niedrēm un ūdensrozēm, guļbūvju ciemats
- ⭐ 15 zelta zvaigznes paslēptas kalnu virsotnēs
- 📜 Uzdevumi ar balvām

## Saglabāšana
Katra spēlētāja progress (monētas, soma, dārzs, zvaigznes, uzdevumi, cepures, mājdzīvnieki, rotājumi, atklātās vietas, kartes gabali, nedēļas mērķis, labākais aplis, zeme un vieta tajā) tiek saglabāts
**tā telefona pārlūkā** zem spēlētāja vārda — ik pēc 5 sekundēm un aizverot spēli. Nākamreiz ieraksti to pašu vārdu.

## Tehniski
- Tīrs HTML + JavaScript, [three.js](https://threejs.org) 3D grafikai, [PeerJS](https://peerjs.com) (WebRTC) tiešiem savienojumiem.
- Nav sava servera: saimnieka telefons ir „serveris”. PeerJS bezmaksas serviss palīdz tikai savienoties.
- Pasaule ģenerēta procedurāli no fiksētas sēklas (`WORLD_SEED`), tāpēc tā katram ir vienāda. 3D modeļi tiek uzbūvēti kodā; zemei, asfaltam un akmeņiem ir foto faktūras (`assets/tex`, ~2,6 MB).
- Versija: `js/version.js`; jaunu versiju iestata ar `node tools/bump-version.mjs X.Y.Z`.

### Publicēšana GitHub Pages
Repozitorijā: **Settings → Pages → Deploy from a branch → `main` / root**. Saite būs
`https://<lietotājs>.github.io/<repozitorijs>/`.

### Lokāli
```
python3 -m http.server 8000
```
un atver `http://localhost:8000`.

### Grafika
☰ izvēlnē ir poga **„🎨 Grafika”**: **Auto** (noklusējums) / Augsta / Vidēja / Zema / Viszemākā.
- **Augsta** — foto faktūras, ūdens atspulgi, mīkstas ēnas, krāsu korekcija, augstāka izšķirtspēja;
- **Vidēja** — foto faktūras un ēnas, bez atspulgiem un pēcapstrādes;
- **Zema** — vienkāršas krāsas, asas ēnas, retāka zāle, mazāks redzamības attālums;
- **Viszemākā** — bez ēnām, zāles un sīkām detaļām, zemāka izšķirtspēja, īsāks redzamības attālums — vājākajiem telefoniem.

**Auto** mēra, cik kadru sekundē telefons zīmē: ja spēle raustās, grafika kļūst vienkāršāka; ja telefons
ilgi tiek galā viegli, tā tiek uzlabota (līdz Augstai). Atrastais līmenis tiek atcerēts nākamajai reizei.
Grafika mainās uzreiz, bez pārlādes.
Faktūras un debesu attēls — [Poly Haven](https://polyhaven.com) (CC0), mapē `assets/`.

### Zināmie ierobežojumi
- Ja saimnieks aizver spēli vai telefons aizmieg, istaba beidzas (pārējo progress saglabājas).
- Dažos mobilajos tīklos WebRTC savienojums var neizdoties — vislabāk visiem būt vienā Wi-Fi.
