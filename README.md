# 🌲 Mežvidu Draugi 🦊

Kopīga 3D piedzīvojumu spēle telefona pārlūkam līdz 4 draugiem. Viss latviski.

▶️ **Spēlēt:** https://artisvitols.github.io/mezvidu-draugi/

Pašreizējā versija: **1.3.1** (redzama sākuma ekrānā un ☰ izvēlnē). Izmaiņas: [CHANGELOG.md](CHANGELOG.md).

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
- 🤝 Kopīgais mērķis — visi kopā salasa noteiktu sēņu skaitu un katrs saņem balvu
- 🌱 Katram savs dārzs ciematā: stādi, aplaisti (arī draugu dārzus!) un novāc ražu
- 🧺 Tirgus: Ūdrs Ojārs (sēklas), Āpsis Arnolds (uzpērk ražu), Pūce Paula (cepures, kartinga krāsas), Bebrs Bruno ar saldējuma ratiņiem
- 🏎️ Kartinga trase ar turbo bultām — 3 apļu sacīkstes ar draugiem un robotiem
- 🦌 Meža dzīvnieki: stirnas, zaķi, eži, mežacūkas, vāveres, stārķi — tos var paglaudīt
- 🌲 Dabiska pasaule: egļu, priežu, bērzu un ozolu meži, kas šūpojas vējā, pļavas ar ziediem, ezeri ar niedrēm un ūdensrozēm, guļbūvju ciemats
- ⭐ 15 zelta zvaigznes paslēptas kalnu virsotnēs
- 📜 Uzdevumi ar balvām

## Saglabāšana
Katra spēlētāja progress (monētas, soma, dārzs, zvaigznes, uzdevumi, cepures, labākais aplis) tiek saglabāts
**tā telefona pārlūkā** zem spēlētāja vārda — ik pēc 5 sekundēm un aizverot spēli. Nākamreiz ieraksti to pašu vārdu.

## Tehniski
- Tīrs HTML + JavaScript, [three.js](https://threejs.org) 3D grafikai, [PeerJS](https://peerjs.com) (WebRTC) tiešiem savienojumiem.
- Nav sava servera: saimnieka telefons ir „serveris”. PeerJS bezmaksas serviss palīdz tikai savienoties.
- Pasaule ģenerēta procedurāli no fiksētas sēklas (`WORLD_SEED`), tāpēc tā katram ir vienāda. Visi 3D modeļi un faktūras tiek uzzīmēti kodā — nav ārēju attēlu failu.
- Versija: `js/version.js`.

### Publicēšana GitHub Pages
Repozitorijā: **Settings → Pages → Deploy from a branch → `main` / root**. Saite būs
`https://<lietotājs>.github.io/<repozitorijs>/`.

### Lokāli
```
python3 -m http.server 8000
```
un atver `http://localhost:8000`.

### Grafika
☰ izvēlnē ir poga **„🎨 Grafika: Augsta/Zema”**. Lēnos telefonos spēle pati samazina izšķirtspēju un izslēdz ēnas.

### Zināmie ierobežojumi
- Ja saimnieks aizver spēli vai telefons aizmieg, istaba beidzas (pārējo progress saglabājas).
- Dažos mobilajos tīklos WebRTC savienojums var neizdoties — vislabāk visiem būt vienā Wi-Fi.
