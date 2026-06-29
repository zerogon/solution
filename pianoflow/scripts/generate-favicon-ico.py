#!/usr/bin/env python3
"""
favicon.ico 생성 — app.png(art'i Piano) 기반.

sharp는 .ico 출력을 지원하지 않아 PIL로 별도 생성한다.
public/app.png 를 흰색으로 평탄화 → 흰 여백 제거 → 약 90% 채움 정사각 패딩 →
멀티사이즈 ICO(16/32/48)로 src/app/favicon.ico 에 저장.
"""
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "app.png"
OUT = ROOT / "src" / "app" / "favicon.ico"

FILL = 0.9  # 정사각 캔버스 대비 로고 채움 비율


def main() -> None:
    app = Image.open(SRC).convert("RGBA")

    # 반투명 흰 배경을 불투명 흰색으로 평탄화
    white = Image.new("RGBA", app.size, (255, 255, 255, 255))
    flat = Image.alpha_composite(white, app).convert("RGB")

    # 흰 여백 trim
    diff = ImageChops.difference(flat, Image.new("RGB", flat.size, (255, 255, 255)))
    bbox = diff.getbbox()
    trimmed = flat.crop(bbox) if bbox else flat

    # 정사각 캔버스 중앙 배치 (여백 포함)
    # Next(Turbopack)의 ICO 디코더는 RGBA 프레임을 요구하므로 RGBA로 생성한다.
    w, h = trimmed.size
    side = int(round(max(w, h) / FILL))
    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 255))
    canvas.paste(trimmed, ((side - w) // 2, (side - h) // 2))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"✓ {OUT.relative_to(ROOT)} ({side}x{side} → 16/32/48)")


if __name__ == "__main__":
    main()
