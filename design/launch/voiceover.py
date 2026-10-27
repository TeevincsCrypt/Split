import sys, json, soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
D=sys.argv[1]; voice=sys.argv[2]
k=Kokoro(f'{D}/kokoro-v1.0.onnx', f'{D}/voices-v1.0.bin')
if voice=='list':
    print(sorted(k.get_voices())); sys.exit()
lines=[
 "Payday shouldn't be a spreadsheet.",
 "Eight transfers.", "Eight addresses.", "Eight chances to get it wrong.",
 "Meet Split.",
 "Set the percentages.", "Approve once.", "And every contributor gets paid in U S D C, in a single transaction.",
 "Everyone gets paid, or nobody does.",
 "Your funds never sit with us,", "and every payout is verifiable on-chain.",
 "Split.", "Pay everyone. In one move.",
]
out=[]
for i,l in enumerate(lines):
    a,sr=k.create(l, voice=voice, speed=float(sys.argv[3]) if len(sys.argv)>3 else 1.0, lang='en-us')
    # trim leading/trailing silence
    idx=np.where(np.abs(a)>0.01)[0]; a=a[max(0,idx[0]-200):idx[-1]+800]
    sf.write(f'{D}/vo_{i:02d}.wav', a, sr); out.append((i,l,round(len(a)/sr,2)))
print(json.dumps(out)); print('total', round(sum(x[2] for x in out),2), 'sr', sr)
