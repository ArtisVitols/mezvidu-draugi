#!/usr/bin/env python3
# 🗣️ Latviešu balsis (1.44.0): ieraksta visas runātās frāzes uz assets/voice/<id>.mp3 ar Piper TTS
# (balss lv_LV-aivars-medium, CC0). Katram tēlam sava balss augstums (pitch) un runas ātrums.
# Takas tēlu teksti tiek nolasīti tieši no js/trail.js (TASKS), lai balss sakristu ar ekrāna tekstu.
#
# 1.47.2: noklusētā balss — Microsoft neironu balsis (Edge „Lasīt skaļi”, pakotne edge-tts): lv-LV-EveritaNeural (sieviete)
# un lv-LV-NilsNeural (vīrietis) — dabiskākas un saprotamākas nekā Piper. Tēla atšķirības — servera pusē (prosody pitch/rate),
# bez mūsu toņa pārbīdes (tā radīja „robota” skaņu). Vajag: pip install edge-tts (un internetu); sūta tikai spēles frāzes.
#   python3 tools/voices.py --edge [id ...]
# Vecais Piper ceļš joprojām strādā:
# Lietošana:  python3 tools/voices.py <piper mape> [id ...]
#   <piper mape> — mape ar `piper/piper` (https://github.com/rhasspy/piper/releases) un lv.onnx + lv.onnx.json
#   (https://huggingface.co/rhasspy/piper-voices/tree/main/lv/lv_LV/aivars/medium). Bez id — ieraksta visu.
import json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'voice')
TARGET = -11.0  # LUFS (1.47.1; agrāk -16)

# tēls → (balss augstums, runas garums — >1 lēnāk)
VOICES = {
    'teicejs': (1.0, 1.0),     # stāstnieks (sacīkstes, līmeņi, paziņojumi)
    'lacis': (0.78, 1.1),
    'vavere': (1.32, 0.92),
    'ezis': (1.2, 1.0),
    'bebritis': (0.93, 1.0),
    'lapsa': (1.12, 0.98),
    'udrs': (0.95, 1.0),
    'apsis': (0.84, 1.06),
    'puce': (1.16, 1.0),
    'suns': (1.06, 0.95),
    'liene': (1.2, 1.0),
    'kakis': (1.1, 1.0),       # autobusa šoferis Kārlis
    'murris': (1.22, 0.96),    # 1.45.0: takas kaķis pie dīķa
    'ronis': (0.88, 1.05),     # 1.46.0: ronis jūrmalā
}

# Edge balsis: tēls → (balss, toņa nobīde, ātrums) — bērniem nedaudz lēnāk
EDGE = {
    'teicejs': ('lv-LV-EveritaNeural', '+0Hz', '-6%'),
    'lacis': ('lv-LV-NilsNeural', '-14Hz', '-12%'),
    'vavere': ('lv-LV-EveritaNeural', '+28Hz', '+2%'),
    'ezis': ('lv-LV-NilsNeural', '+14Hz', '-4%'),
    'bebritis': ('lv-LV-NilsNeural', '+4Hz', '-6%'),
    'lapsa': ('lv-LV-EveritaNeural', '+8Hz', '-4%'),
    'udrs': ('lv-LV-NilsNeural', '+0Hz', '-4%'),
    'apsis': ('lv-LV-NilsNeural', '-9Hz', '-8%'),
    'puce': ('lv-LV-EveritaNeural', '-6Hz', '-6%'),
    'suns': ('lv-LV-NilsNeural', '+16Hz', '+0%'),
    'liene': ('lv-LV-EveritaNeural', '+14Hz', '-3%'),
    'kakis': ('lv-LV-NilsNeural', '+3Hz', '-5%'),     # autobusa šoferis Kārlis
    'murris': ('lv-LV-NilsNeural', '+20Hz', '-4%'),   # takas kaķis
    'ronis': ('lv-LV-NilsNeural', '-6Hz', '-8%'),
}

# skaitļi vārdiem (pareizā locījumā) — balss tos tad izrunā droši
WORDS = [('8 pagales', 'astoņas pagales'), ('12 riekstus', 'divpadsmit riekstus'), ('8 ābolus', 'astoņus ābolus'),
         ('6 dēļus', 'sešus dēļus'), ('10 zivis', 'desmit zivis'), ('Salasiet 10,', 'Salasiet desmit,')]


def clean(t):
    for a, b in WORDS:
        t = t.replace(a, b)
    t = re.sub(r'[\U0001F000-\U0001FFFF☀-➿️‍⚓]', '', t)
    t = t.replace('—', ',').replace('„', '').replace('”', '')
    return re.sub(r'\s+', ' ', re.sub(r'\s+([,.!?])', r'\1', t)).strip()


def trail_tasks():
    src = open(os.path.join(ROOT, 'js', 'trail.js'), encoding='utf-8').read()
    block = src[src.index('export const TASKS'):src.index('export const GIFT_HAT')]
    out = []
    for part in block.split("npc: '")[1:]:
        g = lambda k: re.search(k + r": '([^']*)'", part).group(1)
        out.append({'npc': part[:part.index("'")], 'name': g('name'), 'ask': g('ask'), 'help': g('help'), 'thanks': g('thanks')})
    return out


# spokens nosaukums autobusa stacijām (STATIONS secībā bus.js)
STATIONS = ['Ziemas laukums', 'Ziemeļu sēta', 'Rietumu sēta', 'Sacīkšu trase', 'Austrumu sēta', 'Mežvidu tirgus']


def lines():
    L = []
    T = trail_tasks()
    # datīvs „palīdziet kam” — vispirms jāpalīdz iepriekšējam
    DAT = {'lacis': 'Lācim Brunim', 'vavere': 'Vāverītei Čiekuriņai', 'ezis': 'Ezītim Adatiņam', 'bebritis': 'Bebram Dambītim', 'lapsa': 'Lapsai Smilgai', 'kakis': 'Kaķim Murrim', 'ronis': 'Ronim Viļņukam'}
    for k, t in enumerate(T):
        v = 'murris' if t['npc'] == 'kakis' else t['npc']
        L += [(f't{k}_ask', v, t['ask']), (f't{k}_help', v, t['help']), (f't{k}_thanks', v, t['thanks'])]
        if k < len(T) - 1:
            L.append((f't{k}_again', v, 'Paldies vēlreiz par palīdzību! Visi meža draugi jums pateicīgi.'))
        for p in range(k):
            L.append((f't{k}_wait{p}', v, f'Sveiks! Man arī būs vajadzīga palīdzība, bet vispirms palīdziet {DAT[T[p]["npc"]]}, tas ir atpakaļ pa taku.'))
    L += [
        ('t_fail', 'teicejs', 'Ak vai! Uzdevums neizdevās, visi aizgāja par tālu. Sāciet vēlreiz!'),
        ('t_done', 'teicejs', 'Paveikts kopā! Malači!'),
        ('t_clear', 'teicejs', 'Ceļš brīvs!'),
        ('t_restart', 'teicejs', 'Piedzīvojums sākas no jauna!'),
        ('t_finish', 'teicejs', 'Urrā! Visa taka pabeigta!'),
        ('r_3', 'teicejs', 'Trīs!'), ('r_2', 'teicejs', 'Divi!'), ('r_1', 'teicejs', 'Viens!'), ('r_go', 'teicejs', 'Aiziet!'),
        ('g_level', 'teicejs', 'Jauns līmenis! Lieliski!'),
        ('q_done', 'teicejs', 'Uzdevums izpildīts!'),
        ('v_seeds', 'udrs', 'Sveiks! Man ir labākās sēklas visā Mežvidu ciemā, augļu koku stādi un makšķeres.'),
        ('v_buyer', 'apsis', 'Es uzpērku sēnes, dārzeņus, augļus, zivis un ogas. Par lielu zivi maksāju vairāk!'),
        ('v_pets', 'suns', 'Vau! Katram vajag draugu, kas visur skrien līdzi.'),
        ('v_decor', 'liene', 'Padari savu sētu skaistāko ciemā!'),
        ('v_hats', 'puce', 'Ū-hū! Cepures, krekli, brilles, apavi un vēl! Esi stilīgs!'),
    ]
    for i, s in enumerate(STATIONS):
        L += [(f'b_in{i}', 'kakis', f'Laipni lūdzam! Paldies! Nākamā pietura, {s}.'),
              (f'b_at{i}', 'kakis', f'Pietura, {s}.'),
              (f'b_next{i}', 'kakis', f'Nākamā pietura, {s}.')]
    return L


def raw_piper(piper_dir, voice, text, wav, tmp):
    pitch, ls = VOICES[voice]
    exe = os.path.join(piper_dir, 'piper', 'piper')
    w0 = os.path.join(tmp, 'p.wav')
    subprocess.run([exe, '-m', os.path.join(piper_dir, 'lv.onnx'), '--length_scale', str(ls), '--sentence_silence', '0.25', '-f', w0],
                   input=clean(text).encode('utf-8'), check=True, stderr=subprocess.DEVNULL)
    # augstums bez ātruma maiņas (tikai Piper — tam ir viena balss)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', w0, '-af', f'asetrate={int(22050 * pitch)},aresample=22050,atempo={1 / pitch:.4f}', wav], check=True)


def raw_edge(voice, text, wav, tmp):
    import asyncio
    import edge_tts
    name, pitch, rate = EDGE[voice]
    mp = os.path.join(tmp, 'e.mp3')
    for attempt in range(4):
        try:
            asyncio.run(edge_tts.Communicate(clean(text), name, rate=rate, pitch=pitch).save(mp))
            break
        except Exception as e:  # tīkla kļūme — mēģina vēlreiz
            if attempt == 3: raise
            print('  atkārto:', e)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp, wav], check=True)


def record(engine, lid, voice, text):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'a.wav')
        if engine == '--edge': raw_edge(voice, text, wav, tmp)
        else: raw_piper(engine, voice, text, wav, tmp)
        # dziļie basi nost (telefona skaļrunis); klusums galos nost; skaidrības pacēlums, kompresors,
        # tad izmērīts skaļums → precīzi TARGET LUFS ar limiteri (mēra frāzi 7× pēc kārtas — īsām frāzēm kā „divi”)
        eq = 'equalizer=f=3000:t=q:w=1.2:g=2.5' if engine == '--edge' else 'equalizer=f=3000:t=q:w=1.2:g=4'
        af = ('aresample=24000,highpass=f=110,'
              'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
              f'{eq},acompressor=threshold=-24dB:ratio=3:attack=4:release=120,apad=pad_dur=0.08')
        pre = os.path.join(tmp, 'b.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', af, '-ac', '1', pre], check=True)
        gain = 0
        for _ in range(4):
            r = subprocess.run(['ffmpeg', '-nostats', '-stream_loop', '6', '-i', pre, '-af', f'volume={gain}dB,alimiter=limit=0.7:level=false,ebur128', '-f', 'null', '-'],
                               capture_output=True, text=True)
            m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
            if not m: break
            err = TARGET - float(m[-1])
            if abs(err) < 0.3: break
            gain += err
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', pre, '-af', f'volume={gain}dB,alimiter=limit=0.7:level=false',
                        '-ac', '1', '-ar', '24000', '-b:a', '48k', os.path.join(OUT, lid + '.mp3')], check=True)


def main():
    if len(sys.argv) < 2:
        print(__doc__ or 'python3 tools/voices.py <piper mape> [id ...]'); sys.exit(1)
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[2:])
    L = lines()
    for lid, voice, text in L:
        if only and lid not in only: continue
        record(sys.argv[1], lid, voice, text)
        print(lid, voice, clean(text))
    json.dump(sorted(lid for lid, _, _ in L), open(os.path.join(OUT, 'list.json'), 'w'), ensure_ascii=False)


main()
