# Erzeugt die mitgelieferte Vorlese-Stimme (Wortschnipsel) in audio/jonas/.
#   pip install edge-tts      (nur ohne Azure-Schlüssel nötig)
#   python tools/stimme.py
# Mit AZURE_SPEECH_KEY und AZURE_SPEECH_REGION in der Umgebung wird der offizielle
# Azure-Dienst verwendet (Gratisstufe reicht), sonst edge-tts (nur zum Ausprobieren).
import asyncio, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

STIMME = 'de-AT-JonasNeural'
TEMPO = '+10%'
ZIEL = os.path.join(os.path.dirname(__file__), '..', 'audio', 'jonas')

EINER = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun',
         'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn']
ZEHNER = {2: 'zwanzig', 3: 'dreißig', 4: 'vierzig', 5: 'fünfzig', 6: 'sechzig', 7: 'siebzig', 8: 'achtzig', 9: 'neunzig'}


def zahlwort(n):
    if n < 20:
        return EINER[n]
    if n == 100:
        return 'hundert'
    z, e = divmod(n, 10)
    if e == 0:
        return ZEHNER[z]
    return ('ein' if e == 1 else EINER[e]) + 'und' + ZEHNER[z]


# Dateiname -> gesprochener Text. Zahlen als Wort, damit "5." nicht als "fünfte" gelesen wird.
# z = in der Satzmitte, e = am Satzende, f = am Ende einer Frage.
SCHNIPSEL = {'plus': 'plus', 'minus': 'minus', 'mal': 'mal', 'durch': 'durch', 'ergibt': 'ergibt',
             'wieviel': 'wie viel', 'wieviel-anfang': 'Wie viel'}
for n in range(101):
    w = zahlwort(n)
    SCHNIPSEL[f'z{n}'] = w
    SCHNIPSEL[f'e{n}'] = w + '.'
    SCHNIPSEL[f'f{n}'] = w + '?'


def azure(text, key, region):
    ssml = (f'<speak version="1.0" xml:lang="de-AT"><voice name="{STIMME}">'
            f'<prosody rate="{TEMPO}">{text}</prosody></voice></speak>')
    req = urllib.request.Request(
        f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml.encode('utf-8'),
        headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
                 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'rechenheld'})
    with urllib.request.urlopen(req) as r:
        return r.read()


def edge(text):
    import edge_tts

    async def los():
        daten = b''
        async for teil in edge_tts.Communicate(text, STIMME, rate=TEMPO).stream():
            if teil['type'] == 'audio':
                daten += teil['data']
        return daten
    return asyncio.run(los())


def main():
    os.makedirs(ZIEL, exist_ok=True)
    key, region = os.environ.get('AZURE_SPEECH_KEY'), os.environ.get('AZURE_SPEECH_REGION')
    sprich = (lambda t: azure(t, key, region)) if key and region else edge
    print('Dienst:', 'Azure' if key and region else 'edge-tts (nur zum Ausprobieren)')

    def eins(eintrag):
        name, text = eintrag
        fehler = 'leere Antwort'
        for _ in range(3):
            try:
                daten = sprich(text)
                if daten:
                    with open(os.path.join(ZIEL, name + '.mp3'), 'wb') as f:
                        f.write(daten)
                    return None
            except Exception as e:
                fehler = e
        return f'{name}: {fehler}'

    with ThreadPoolExecutor(4) as pool:
        probleme = [p for p in pool.map(eins, SCHNIPSEL.items()) if p]
    for p in probleme:
        print('FEHLER', p)
    print(f'{len(SCHNIPSEL) - len(probleme)} von {len(SCHNIPSEL)} Schnipseln in {os.path.normpath(ZIEL)}')
    sys.exit(1 if probleme else 0)


if __name__ == '__main__':
    main()
