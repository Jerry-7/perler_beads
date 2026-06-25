import logging

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.models import AiImageResponse, AiImageStatusResponse, GenerationResponse, GenerationStatusResponse, PaletteResponse, PatternDebugAnalysis, PatternSizeRecommendation
from app.palette import PALETTE_VERSION, get_enabled_palette, get_palette
from app.services.ai_images import ai_image_store
from app.services.color_simplification import ColorSimplificationProfile
from app.services.generation import GenerationError, generation_store
from app.services.pattern_debug import PatternDebugError, analyze_pattern_mapping
from app.services.size_recommendation import SizeRecommendationError, recommend_pattern_size_from_image

AI_STYLE_OPTIONS = {"faithful", "iconic", "crafted", "dramatic"}
AI_EFFECT_3D_OPTIONS = {"none", "subtle", "balanced", "strong"}
AI_SHADING_OPTIONS = {"flat", "step", "dithered"}
SAMPLING_MODE_OPTIONS = {"raw", "edge", "dominant", "detail", "smooth", "nearest", "coverage", "center-shrink", "grid-scan", "ultra-small", "line-art"}
LOGGER = logging.getLogger(__name__)

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

app = FastAPI(title="Perler Beads Pattern Generator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, object]:
    return {"status": "ok", "samplingModes": sorted(SAMPLING_MODE_OPTIONS)}


@app.get("/api/palette", response_model=PaletteResponse)
def palette() -> PaletteResponse:
    return PaletteResponse(version=PALETTE_VERSION, colors=get_palette())


@app.post("/api/pattern-size/recommendation", response_model=PatternSizeRecommendation)
async def recommend_pattern_size(image: UploadFile = File(...)) -> PatternSizeRecommendation:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")

    try:
        return recommend_pattern_size_from_image(image_bytes)
    except SizeRecommendationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def validate_generation_controls(width_cells: int, height_cells: int, source_mode: str, sampling_mode: str = "dominant") -> None:
    if width_cells < 1 or height_cells < 1:
        raise HTTPException(status_code=400, detail="widthCells and heightCells must be positive")
    if width_cells > 200 or height_cells > 200:
        raise HTTPException(status_code=400, detail="widthCells and heightCells must be <= 200")
    if source_mode not in {"auto", "pixel-art", "resample"}:
        raise HTTPException(status_code=400, detail="sourceMode must be auto, pixel-art, or resample")
    if sampling_mode not in SAMPLING_MODE_OPTIONS:
        raise HTTPException(status_code=400, detail="samplingMode must be raw, edge, dominant, detail, smooth, nearest, coverage, center-shrink, grid-scan, ultra-small, or line-art")


def validate_ai_controls(ai_detail: str, ai_style: str, ai_effect_3d: str, ai_shading: str, ai_max_colors: int) -> None:
    if ai_detail not in {"simple", "balanced", "detailed"}:
        raise HTTPException(status_code=400, detail="aiDetail must be simple, balanced, or detailed")
    if ai_style not in AI_STYLE_OPTIONS:
        raise HTTPException(status_code=400, detail="aiStyle must be faithful, iconic, crafted, or dramatic")
    if ai_effect_3d not in AI_EFFECT_3D_OPTIONS:
        raise HTTPException(status_code=400, detail="aiEffect3d must be none, subtle, balanced, or strong")
    if ai_shading not in AI_SHADING_OPTIONS:
        raise HTTPException(status_code=400, detail="aiShading must be flat, step, or dithered")
    if ai_max_colors < 4 or ai_max_colors > 64:
        raise HTTPException(status_code=400, detail="aiMaxColors must be between 4 and 64")


def validate_max_colors(ai_max_colors: int) -> None:
    if ai_max_colors < 4 or ai_max_colors > 64:
        raise HTTPException(status_code=400, detail="aiMaxColors must be between 4 and 64")


async def read_uploaded_image(image: UploadFile) -> bytes:
    if image.content_type and not image.content_type.startswith("image/") and image.content_type != "application/octet-stream":
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")
    return image_bytes


async def read_generation_image(image: UploadFile | None, ai_image_id: str | None) -> bytes:
    if image is None and not ai_image_id:
        raise HTTPException(status_code=400, detail="image or aiImageId is required")
    if image is not None and ai_image_id:
        raise HTTPException(status_code=400, detail="Provide either image or aiImageId, not both")
    if image is not None:
        return await read_uploaded_image(image)

    assert ai_image_id is not None
    ai_image = ai_image_store.get(ai_image_id)
    if ai_image is None or not ai_image.image_bytes:
        raise HTTPException(status_code=404, detail="AI image not found")
    return ai_image.image_bytes


def ai_image_url(ai_image_id: str) -> str:
    return f"/api/ai-images/{ai_image_id}/image"


@app.post("/api/generations", response_model=GenerationResponse)
async def create_generation(
    image: UploadFile | None = File(None),
    widthCells: int = Form(...),
    heightCells: int = Form(...),
    aiImageId: str | None = Form(None),
    sourceMode: str = Form("auto"),
    colorComplexity: str = Form("balanced"),
    samplingMode: str = Form("dominant"),
    aiMaxColors: int = Form(16),
) -> GenerationResponse:
    validate_generation_controls(widthCells, heightCells, sourceMode, samplingMode)
    validate_max_colors(aiMaxColors)
    try:
        color_complexity = ColorSimplificationProfile(colorComplexity)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="colorComplexity must be minimal, simple, balanced, detailed, or original",
        ) from exc
    image_bytes = await read_generation_image(image, aiImageId)

    try:
        generation = generation_store.create(
            image_bytes=image_bytes,
            width_cells=widthCells,
            height_cells=heightCells,
            palette=get_enabled_palette(),
            source_mode=sourceMode,
            color_complexity=color_complexity,
            sampling_mode=samplingMode,
            max_colors=aiMaxColors,
        )
    except GenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return GenerationResponse(generationId=generation.id, status=generation.status)


@app.post("/api/pattern-debug/analyze", response_model=PatternDebugAnalysis)
async def analyze_pattern_debug(
    image: UploadFile = File(...),
    widthCells: int = Form(...),
    heightCells: int = Form(...),
) -> PatternDebugAnalysis:
    validate_generation_controls(widthCells, heightCells, "resample", "nearest")
    image_bytes = await read_uploaded_image(image)
    try:
        return analyze_pattern_mapping(image_bytes, widthCells, heightCells)
    except PatternDebugError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/ai-images", response_model=AiImageResponse)
async def create_ai_image(
    image: UploadFile = File(...),
    widthCells: int = Form(...),
    heightCells: int = Form(...),
    aiDetail: str = Form("balanced"),
    aiStyle: str = Form("faithful"),
    aiEffect3d: str = Form("balanced"),
    aiShading: str = Form("step"),
    aiMaxColors: int = Form(16),
) -> AiImageResponse:
    LOGGER.info(
        "ai_image endpoint_received width_cells=%s height_cells=%s ai_detail=%s ai_style=%s ai_effect_3d=%s ai_shading=%s ai_max_colors=%s",
        widthCells,
        heightCells,
        aiDetail,
        aiStyle,
        aiEffect3d,
        aiShading,
        aiMaxColors,
    )
    validate_generation_controls(widthCells, heightCells, "resample")
    validate_ai_controls(aiDetail, aiStyle, aiEffect3d, aiShading, aiMaxColors)
    image_bytes = await read_uploaded_image(image)
    ai_image = ai_image_store.create(
        image_bytes=image_bytes,
        width_cells=widthCells,
        height_cells=heightCells,
        ai_detail=aiDetail,
        ai_style=aiStyle,
        ai_effect_3d=aiEffect3d,
        ai_shading=aiShading,
        ai_max_colors=aiMaxColors,
    )
    LOGGER.info("ai_image endpoint_returning id=%s status=%s", ai_image.id, ai_image.status)

    return AiImageResponse(
        aiImageId=ai_image.id,
        status=ai_image.status,
        imageUrl=ai_image_url(ai_image.id) if ai_image.image_bytes else None,
    )


@app.get("/api/ai-images/{ai_image_id}", response_model=AiImageStatusResponse)
def get_ai_image(ai_image_id: str) -> AiImageStatusResponse:
    ai_image = ai_image_store.get(ai_image_id)
    if ai_image is None:
        raise HTTPException(status_code=404, detail="AI image not found")
    return AiImageStatusResponse(
        aiImageId=ai_image.id,
        status=ai_image.status,
        imageUrl=ai_image_url(ai_image.id) if ai_image.image_bytes else None,
        error=ai_image.error,
    )


@app.get("/api/ai-images/{ai_image_id}/image")
def get_ai_image_file(ai_image_id: str) -> Response:
    ai_image = ai_image_store.get(ai_image_id)
    if ai_image is None or not ai_image.image_bytes:
        raise HTTPException(status_code=404, detail="AI image not found")
    return Response(content=ai_image.image_bytes, media_type=ai_image.content_type)


@app.get("/api/generations/{generation_id}", response_model=GenerationStatusResponse)
def get_generation(generation_id: str) -> GenerationStatusResponse:
    generation = generation_store.get(generation_id)
    if generation is None:
        raise HTTPException(status_code=404, detail="Generation not found")
    return GenerationStatusResponse(
        generationId=generation.id,
        status=generation.status,
        error=generation.error,
        result=generation.result,
    )
