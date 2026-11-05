"""Synthetic, valid PDFs only. Never contains customer property documents."""
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.utils import ImageReader
from PIL import Image,ImageDraw


def pdf_bytes(pages=('토지면적 1,000㎡ · 지상 4층',), *, encrypted=False, scanned=False, scanned_pages=()):
    output=BytesIO()
    pdfmetrics.registerFont(UnicodeCIDFont('HYSMyeongJo-Medium'))
    writer=canvas.Canvas(output,invariant=1,encrypt='fixture-only' if encrypted else None)
    for index,text in enumerate(pages,1):
        if scanned or index in scanned_pages:
            image=Image.new('RGB',(160,80),'#dce6ea')
            drawing=ImageDraw.Draw(image)
            drawing.rectangle((5,25,150,65),outline='black',width=3)
            drawing.text((8,8),'SCANNED FIXTURE',fill='black')
            writer.drawImage(ImageReader(image),30,670,200,100)
        elif text:
            writer.setFont('HYSMyeongJo-Medium',12)
            writer.drawString(30,750,text)
        writer.showPage()
    writer.save()
    return output.getvalue()
