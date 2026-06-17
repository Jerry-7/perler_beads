from typing import Literal

from pydantic import BaseModel, Field


Rgb = tuple[int, int, int]


class PaletteColor(BaseModel):
    code: str
    name: str
    rgb: Rgb
    enabled: bool = True


class PaletteResponse(BaseModel):
    version: str
    colors: list[PaletteColor]


class PatternSizeRecommendation(BaseModel):
    widthCells: int
    heightCells: int
    sourceWidth: int
    sourceHeight: int
    detectedBlockWidth: int | None = None
    detectedBlockHeight: int | None = None
    confidence: float = 0
    reason: str


class PatternDebugAnalysis(BaseModel):
    sourceWidth: int
    sourceHeight: int
    detectedBlockWidth: int | None = None
    detectedBlockHeight: int | None = None
    detectedGridWidth: int
    detectedGridHeight: int
    detectedPixelCount: int
    compressedGridWidth: int
    compressedGridHeight: int
    compressedPixelCount: int
    originalPreviewDataUrl: str
    compressedPreviewDataUrl: str


class PixelCell(BaseModel):
    x: int
    y: int
    empty: Literal[True] = True


class BeadCell(BaseModel):
    x: int
    y: int
    sourceRgb: Rgb
    beadCode: str
    beadName: str
    beadRgb: Rgb
    distance: float


class RawColorCell(BaseModel):
    x: int
    y: int
    sourceRgb: Rgb


PatternCell = PixelCell | BeadCell | RawColorCell


class BeadUsage(BaseModel):
    beadCode: str
    beadName: str
    beadRgb: Rgb
    count: int


class PatternResult(BaseModel):
    widthCells: int
    heightCells: int
    paletteVersion: str
    cells: list[list[PatternCell]]
    usage: list[BeadUsage]
    generatedAt: str


class GenerationResponse(BaseModel):
    generationId: str
    status: Literal["pending", "processing", "completed", "failed"]


class GenerationStatusResponse(GenerationResponse):
    error: str | None = None
    result: PatternResult | None = None


class AiImageResponse(BaseModel):
    aiImageId: str
    status: Literal["pending", "processing", "completed", "failed"]
    imageUrl: str | None = None


class AiImageStatusResponse(AiImageResponse):
    error: str | None = None
