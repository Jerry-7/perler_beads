from io import BytesIO

from PIL import Image, ImageDraw

from app.models import PaletteColor
from app.services.grid_scan_pattern import process_grid_scan_bead_pattern


def make_grid_scan_image() -> bytes:
    cell_size = 7
    line_size = 1
    width_cells = 3
    height_cells = 2
    width = width_cells * cell_size + (width_cells + 1) * line_size
    height = height_cells * cell_size + (height_cells + 1) * line_size
    image = Image.new("RGB", (width, height), (20, 20, 20))
    colors = [
        [(250, 20, 20), (20, 20, 250), (248, 248, 248)],
        [(20, 220, 20), (250, 20, 20), (20, 20, 250)],
    ]

    for row in range(height_cells):
        for col in range(width_cells):
            left = line_size + col * (cell_size + line_size)
            top = line_size + row * (cell_size + line_size)
            for y in range(top, top + cell_size):
                for x in range(left, left + cell_size):
                    image.putpixel((x, y), colors[row][col])

    center_x = line_size + cell_size // 2
    center_y = line_size + cell_size // 2
    image.putpixel((center_x, center_y), (20, 20, 250))

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()



def make_large_partially_covered_grid_image() -> bytes:
    cell_size = 6
    line_size = 1
    width_cells = 78
    height_cells = 78
    width = width_cells * cell_size + (width_cells + 1) * line_size
    height = height_cells * cell_size + (height_cells + 1) * line_size
    image = Image.new("RGB", (width, height), (246, 246, 246))

    for x in range(0, width, cell_size + line_size):
        for y in range(height):
            image.putpixel((x, y), (128, 128, 128))
    for y in range(0, height, cell_size + line_size):
        for x in range(width):
            image.putpixel((x, y), (128, 128, 128))

    for row in range(8, 72):
        for col in range(12, 68):
            rgb = (8, 8, 8) if (row + col) % 5 < 3 else (28, 190, 70)
            left = line_size + col * (cell_size + line_size)
            top = line_size + row * (cell_size + line_size)
            for y in range(top, top + cell_size):
                for x in range(left, left + cell_size):
                    image.putpixel((x, y), rgb)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()

def make_mixed_cell_grid_image() -> bytes:
    cell_size = 9
    line_size = 1
    width_cells = 1
    height_cells = 1
    width = width_cells * cell_size + (width_cells + 1) * line_size
    height = height_cells * cell_size + (height_cells + 1) * line_size
    image = Image.new("RGB", (width, height), (80, 80, 80))

    for y in range(line_size, line_size + cell_size):
        for x in range(line_size, line_size + cell_size):
            image.putpixel((x, y), (250, 20, 20))

    center_left = line_size + 2
    center_top = line_size + 2
    purple_pixels = {
        (center_left + dx, center_top + dy)
        for dy in range(5)
        for dx in range(5)
        if dx < 2 or (dx == 2 and dy < 2)
    }
    for x, y in purple_pixels:
        image.putpixel((x, y), (130, 20, 130))

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()

def make_margin_grid_image() -> bytes:
    cell_size = 8
    line_size = 1
    width_cells = 4
    height_cells = 3
    margin_left = 20
    margin_top = 16
    margin_right = 10
    margin_bottom = 12
    grid_width = width_cells * cell_size + (width_cells + 1) * line_size
    grid_height = height_cells * cell_size + (height_cells + 1) * line_size
    image = Image.new(
        "RGB",
        (margin_left + grid_width + margin_right, margin_top + grid_height + margin_bottom),
        (255, 255, 255),
    )
    draw = ImageDraw.Draw(image)
    for index in range(6):
        draw.text((2, margin_top + index * 5), str(index + 1), fill=(55, 55, 55))

    for x in range(margin_left, margin_left + grid_width, cell_size + line_size):
        for y in range(margin_top, margin_top + grid_height):
            image.putpixel((x, y), (120, 120, 120))
    for y in range(margin_top, margin_top + grid_height, cell_size + line_size):
        for x in range(margin_left, margin_left + grid_width):
            image.putpixel((x, y), (120, 120, 120))

    colors = [
        (250, 20, 20),
        (20, 20, 250),
        (20, 220, 20),
        (250, 220, 20),
    ]
    for row in range(height_cells):
        for col in range(width_cells):
            left = margin_left + line_size + col * (cell_size + line_size)
            top = margin_top + line_size + row * (cell_size + line_size)
            for y in range(top, top + cell_size):
                for x in range(left, left + cell_size):
                    image.putpixel((x, y), colors[(row + col) % len(colors)])

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()

def make_thick_line_empty_grid_image() -> bytes:
    cell_size = 4
    line_size = 4
    width_cells = 2
    height_cells = 1
    width = width_cells * cell_size + (width_cells + 1) * line_size
    height = height_cells * cell_size + (height_cells + 1) * line_size
    image = Image.new("RGB", (width, height), (45, 45, 45))

    for row in range(height_cells):
        for col in range(width_cells):
            left = line_size + col * (cell_size + line_size)
            top = line_size + row * (cell_size + line_size)
            fill = (248, 248, 248) if col == 0 else (250, 20, 20)
            for y in range(top, top + cell_size):
                for x in range(left, left + cell_size):
                    image.putpixel((x, y), fill)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()

def make_thick_line_grid_with_missing_inner_line_image() -> bytes:
    cell_size = 4
    line_size = 4
    width_cells = 2
    height_cells = 1
    width = width_cells * cell_size + (width_cells + 1) * line_size
    height = height_cells * cell_size + (height_cells + 1) * line_size
    image = Image.new("RGB", (width, height), (248, 248, 248))

    for x in list(range(0, line_size)) + list(range(width - line_size, width)):
        for y in range(height):
            image.putpixel((x, y), (45, 45, 45))
    for y in list(range(0, line_size)) + list(range(height - line_size, height)):
        for x in range(width):
            image.putpixel((x, y), (45, 45, 45))

    right_left = line_size + cell_size + line_size
    top = line_size
    for y in range(top, top + cell_size):
        for x in range(right_left, right_left + cell_size):
            image.putpixel((x, y), (250, 20, 20))

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()

def test_grid_scan_detects_grid_size_and_samples_cell_centers() -> None:
    palette = [
        PaletteColor(code="RED", name="Red", rgb=(255, 0, 0)),
        PaletteColor(code="BLUE", name="Blue", rgb=(0, 0, 255)),
        PaletteColor(code="GREEN", name="Green", rgb=(0, 220, 0)),
        PaletteColor(code="WHITE", name="White", rgb=(255, 255, 255)),
    ]

    result = process_grid_scan_bead_pattern(
        image_bytes=make_grid_scan_image(),
        bead_palette=palette,
    )

    assert result.widthCells == 3
    assert result.heightCells == 2
    assert result.cells[0][0].beadCode == "RED"
    assert result.cells[0][1].beadCode == "BLUE"
    assert getattr(result.cells[0][2], "empty", False) is True
    assert result.cells[1][0].beadCode == "GREEN"
    assert result.rleRows == ["RED:1,BLUE:1,EMPTY:1", "GREEN:1,RED:1,BLUE:1"]


def test_grid_scan_reconstructs_grid_lines_hidden_by_large_artwork() -> None:
    palette = [
        PaletteColor(code="BLACK", name="Black", rgb=(0, 0, 0)),
        PaletteColor(code="GREEN", name="Green", rgb=(0, 190, 60)),
        PaletteColor(code="WHITE", name="White", rgb=(255, 255, 255)),
    ]

    result = process_grid_scan_bead_pattern(
        image_bytes=make_large_partially_covered_grid_image(),
        bead_palette=palette,
        target_width=78,
        target_height=78,
    )

    assert result.widthCells == 78
    assert result.heightCells == 78
    assert result.cells[10][14].beadCode in {"BLACK", "GREEN"}
    assert getattr(result.cells[0][0], "empty", False) is True

def test_grid_scan_forces_target_size_when_it_conflicts_with_detected_period() -> None:
    palette = [
        PaletteColor(code="BLACK", name="Black", rgb=(0, 0, 0)),
        PaletteColor(code="GREEN", name="Green", rgb=(0, 190, 60)),
        PaletteColor(code="WHITE", name="White", rgb=(255, 255, 255)),
    ]

    result = process_grid_scan_bead_pattern(
        image_bytes=make_large_partially_covered_grid_image(),
        bead_palette=palette,
        target_width=52,
        target_height=52,
    )

    assert result.widthCells == 52
    assert result.heightCells == 52

def test_grid_scan_uses_dominant_center_color_instead_of_blending_colors() -> None:
    palette = [
        PaletteColor(code="RED", name="Red", rgb=(255, 0, 0)),
        PaletteColor(code="PURPLE", name="Purple", rgb=(128, 0, 128)),
        PaletteColor(code="MIX", name="Mixed red purple", rgb=(192, 20, 73)),
    ]

    result = process_grid_scan_bead_pattern(
        image_bytes=make_mixed_cell_grid_image(),
        bead_palette=palette,
    )

    assert result.widthCells == 1
    assert result.heightCells == 1
    assert result.cells[0][0].beadCode == "RED"

def test_grid_scan_uses_expected_size_to_lock_grid_region_with_margins() -> None:
    palette = [
        PaletteColor(code="RED", name="Red", rgb=(255, 0, 0)),
        PaletteColor(code="BLUE", name="Blue", rgb=(0, 0, 255)),
        PaletteColor(code="GREEN", name="Green", rgb=(0, 220, 0)),
        PaletteColor(code="YELLOW", name="Yellow", rgb=(255, 220, 0)),
        PaletteColor(code="WHITE", name="White", rgb=(255, 255, 255)),
    ]

    result = process_grid_scan_bead_pattern(
        image_bytes=make_margin_grid_image(),
        bead_palette=palette,
        target_width=4,
        target_height=3,
    )

    assert result.widthCells == 4
    assert result.heightCells == 3
    assert [cell.beadCode for cell in result.cells[0]] == ["RED", "BLUE", "GREEN", "YELLOW"]

def test_grid_scan_does_not_treat_thick_grid_lines_as_cell_colors() -> None:
    palette = [
        PaletteColor(code="BLACK", name="Black", rgb=(0, 0, 0)),
        PaletteColor(code="RED", name="Red", rgb=(255, 0, 0)),
        PaletteColor(code="WHITE", name="White", rgb=(255, 255, 255)),
    ]

    result = process_grid_scan_bead_pattern(
        image_bytes=make_thick_line_empty_grid_image(),
        bead_palette=palette,
        target_width=2,
        target_height=1,
    )

    assert result.widthCells == 2
    assert result.heightCells == 1
    assert getattr(result.cells[0][0], "empty", False) is True
    assert result.cells[0][1].beadCode == "RED"

def test_grid_scan_reconstructed_thick_lines_do_not_bleed_into_cells() -> None:
    palette = [
        PaletteColor(code="BLACK", name="Black", rgb=(0, 0, 0)),
        PaletteColor(code="RED", name="Red", rgb=(255, 0, 0)),
        PaletteColor(code="WHITE", name="White", rgb=(255, 255, 255)),
    ]

    result = process_grid_scan_bead_pattern(
        image_bytes=make_thick_line_grid_with_missing_inner_line_image(),
        bead_palette=palette,
        target_width=2,
        target_height=1,
    )

    assert result.widthCells == 2
    assert result.heightCells == 1
    assert getattr(result.cells[0][0], "empty", False) is True
    assert result.cells[0][1].beadCode == "RED"
