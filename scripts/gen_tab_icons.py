"""Generate WeChat mini-program tab bar icons (81x81 PNG)."""
from PIL import Image, ImageDraw
import os

SIZE = 81
COLORS = {
    "unselected": "#8b9488",
    "selected": "#2a4d3a",
}
OUT = os.path.join(
    os.path.dirname(__file__), "..", "miniprogram", "images", "tab-icons"
)


def draw_icon(draw, name, color):
    """Draw a simple geometric icon shape."""
    c = color
    # Helper: draw a stroked circle
    def circle(cx, cy, r, width=3):
        draw.ellipse(
            [cx - r, cy - r, cx + r, cy + r], outline=c, width=width
        )

    def line(x1, y1, x2, y2, width=3):
        draw.line([(x1, y1), (x2, y2)], fill=c, width=width)

    if name == "home":
        # House: square walls + triangle roof
        # Roof
        draw.polygon([(14, 42), (40, 16), (66, 42)], outline=c, width=3)
        # Walls
        draw.rectangle([20, 42, 60, 68], outline=c, width=3)
        # Door
        draw.rectangle([33, 52, 47, 68], outline=c, width=3)

    elif name == "identify":
        # Magnifying glass: circle + handle
        circle(36, 32, 20)
        line(50, 48, 68, 66, width=4)

    elif name == "knowledge":
        # Open book
        # Left page
        draw.rectangle([16, 22, 40, 62], outline=c, width=3)
        # Right page
        draw.rectangle([40, 22, 64, 62], outline=c, width=3)
        # Spine line
        line(40, 22, 40, 62, width=3)
        # Page lines (left)
        line(20, 34, 36, 34, width=2)
        line(20, 44, 36, 44, width=2)
        # Page lines (right)
        line(44, 34, 60, 34, width=2)
        line(44, 44, 60, 44, width=2)

    elif name == "me":
        # Person: head + body
        # Head
        circle(40, 24, 12)
        # Body (trapezoid shoulders)
        draw.polygon(
            [(20, 44), (60, 44), (68, 72), (12, 72)], outline=c, width=3
        )


def generate():
    os.makedirs(OUT, exist_ok=True)
    names = ["home", "identify", "knowledge", "me"]
    labels = ["home", "identify", "knowledge", "me"]
    for name, _ in zip(names, labels):
        for state, hex_color in COLORS.items():
            img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            draw_icon(draw, name, hex_color)
            fname = f"{name}-{state}.png"
            img.save(os.path.join(OUT, fname), "PNG")
            print(f"  {fname}")


if __name__ == "__main__":
    generate()
