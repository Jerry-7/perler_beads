from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.models import GenerationResponse, GenerationStatusResponse, PaletteResponse
from app.palette import PALETTE_VERSION, get_enabled_palette, get_palette
from app.services.generation import GenerationError, generation_store

app = FastAPI(title="Perler Beads Pattern Generator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/palette", response_model=PaletteResponse)
def palette() -> PaletteResponse:
    return PaletteResponse(version=PALETTE_VERSION, colors=get_palette())


@app.post("/api/generations", response_model=GenerationResponse)
async def create_generation(
    image: UploadFile = File(...),
    widthCells: int = Form(...),
    heightCells: int = Form(...),
) -> GenerationResponse:
    if widthCells < 1 or heightCells < 1:
        raise HTTPException(status_code=400, detail="widthCells and heightCells must be positive")
    if widthCells > 200 or heightCells > 200:
        raise HTTPException(status_code=400, detail="widthCells and heightCells must be <= 200")
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")

    try:
        generation = generation_store.create(
            image_bytes=image_bytes,
            width_cells=widthCells,
            height_cells=heightCells,
            palette=get_enabled_palette(),
        )
    except GenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return GenerationResponse(generationId=generation.id, status=generation.status)


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
