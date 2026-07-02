#!/usr/bin/env python3
"""Branded 1200x630 social share card."""
from PIL import Image, ImageDraw, ImageFont
W,H=1200,630
GREEN=(14,59,46); GREEN2=(18,74,57); GOLD=(232,181,75); CREAM=(246,242,233); MUT=(190,208,196)
img=Image.new('RGB',(W,H),GREEN)
d=ImageDraw.Draw(img)
# vertical gradient
for y in range(H):
    t=y/H
    c=(int(11+ (26-11)*t), int(46+(92-46)*t), int(34+(69-34)*t))
    d.line([(0,y),(W,y)],fill=c)
# gold glow top-right
glow=Image.new('RGBA',(W,H),(0,0,0,0)); gd=ImageDraw.Draw(glow)
gd.ellipse([W-560,-260,W+180,360],fill=(232,181,75,46))
img=Image.alpha_composite(img.convert('RGBA'),glow).convert('RGB')
d=ImageDraw.Draw(img)
serif=lambda s:ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia Bold.ttf',s)
serifi=lambda s:ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf',s)
sans=lambda s:ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',s) if __import__('os').path.exists('/System/Library/Fonts/Supplemental/Arial.ttf') else ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',s)
# badge right
badge=Image.open('site/img/badge.png').convert('RGBA')
bw=300; badge=badge.resize((bw,int(badge.height*bw/badge.width)),Image.LANCZOS)
img.paste(badge,(W-bw-70,(H-badge.height)//2),badge)
# eyebrow
d.text((72,120),"PUEBLO, COLORADO · REC 21+",font=sans(22),fill=GOLD)
# headline
d.text((70,164),"Terps Dispensary",font=serif(74),fill=CREAM)
d.text((70,250),"Pueblo's best shelf,",font=serif(52),fill=CREAM)
d.text((70,312),"now ",font=serif(52),fill=CREAM)
w0=d.textlength("now ",font=serif(52))
d.text((70+w0,312),"online.",font=serifi(52),fill=GOLD)
# stat line
d.text((72,420),"290+ products · 740+ strains · updated live",font=sans(26),fill=MUT)
# url pill
d.rounded_rectangle([72,478,470,534],radius=28,fill=GOLD)
d.text((104,491),"terpsdispensary.com",font=sans(26),fill=GREEN)
img.save('site/img/og-card.jpg','JPEG',quality=90)
print('og-card.jpg', img.size)
