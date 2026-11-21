# TODO — nākamās idejas

## Grafika (pēc 1.6.0)
- [ ] **Koki un augi ar foto faktūrām:** īstas lapu un skuju faktūras (CC0, piem. Poly Haven / ambientCG),
      mizas faktūra stumbriem (`pine_bark`, `bark_brown_01`), blīvākas meža malas.
- [ ] **Īsti 3D modeļi** (glTF, CC0): reālistiskas mājas, ratiņi, akmeņi, žogi, laiva.
      Jāpievieno `GLTFLoader`; modeļiem jābūt mazos failos (< 1–2 MB kopā), ar LOD.
- [ ] Dēļu/koka foto faktūras guļbūvēm, laipai, tornim (`weathered_planks`, `wood_planks`).
- [ ] Ūdens: viļņi, kas kustina virsmu; ūdensrozes atspulgā.
- [ ] Diennakts maiņa (rīts / diena / vakars) un mākoņu ēnas.
- [ ] Ja telefoni tiek galā: kaskādes ēnas lielākā attālumā.

## Blakus zemes (1.7.0 — pagaidām līdzenas)
- [x] ❄️ Ziemas zeme (1.10.0): slēpošanas kalns ar pacēlāju, sniega piku kauja, sniegputenis, ziemeļbrieži.
- [x] 1.14.0: 🏡 sēta centrā (lauksaimniecība), 🌲 mežs austrumos, 🏁 trase ar tuneļiem rietumos.
- [x] Dienvidu zeme — 🧭 Piedzīvojumu mežs ar taku, 5 NPC uzdevumiem un jūru (1.39.0). Var pievienot vēl NPC un uzdevumus.
- [ ] Sētā: ēkas (klēts, šķūnis), dzīvnieki (vistas, govis), traktors aršanai vairākiem lauciņiem uzreiz.
- [ ] Ziemas zemē: slēpošanas sacensības ar laiku visiem, ragaviņas, slidotava.
      Zemes stāvoklim ir rezervēts `save.zones`; kopīgām lietām (kā sēnes) vajadzēs saimnieka stāvokli pa zemēm.

## Dzīvnieku tēli
- [ ] Tagad multfilmas stilā. Reālistiski dzīvnieki ar drēbēm un cepurēm var izskatīties dīvaini —
      ja gribam, vajag īstus animētus modeļus (iespējams, maksas).

## Vietas pasaulē (piedāvātas, vēl nav)
- [ ] Upe ar tiltu un ūdenskritumu
- [ ] Pludmale
- [ ] Vējdzirnavas

## Zināmās nianses
- [ ] Ķeramā atpakaļskaitīšana viesim headless testā rādīja nepareizu laiku (droši vien testa lēnuma dēļ) — pārbaudīt uz īstiem telefoniem.
- [ ] Pārbaudīt, cik ātri jāspiež „VILKT!” uz īsta telefona (logs ~1,7 s).
