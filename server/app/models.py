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
    recommendedColors: int = 16
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
    cells: list[list[PatternCell]] | None = None
    usage: list[BeadUsage]
    generatedAt: str
    rleRows: list[str] | None = None


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


class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AdminLoginResponse(BaseModel):
    adminToken: str
    expiresAt: str


class UserSummary(BaseModel):
    openid: str
    createdAt: str
    lastLoginAt: str


class WechatLoginRequest(BaseModel):
    code: str = Field(min_length=1)


class WechatLoginResponse(BaseModel):
    sessionToken: str
    expiresAt: str
    userSummary: UserSummary


class AiPackageOffer(BaseModel):
    code: str
    title: str
    amountFen: int
    quotaAmount: int


class AiAccessSummary(BaseModel):
    remainingQuota: int
    hasFreeAccess: bool
    freeAccessExpiresAt: str | None = None
    canGenerateAi: bool
    activePackageOffers: list[AiPackageOffer]


class CreateAiOrderRequest(BaseModel):
    packageCode: str = Field(min_length=1)


class AiOrderPaymentParams(BaseModel):
    timeStamp: str
    nonceStr: str
    package: str
    signType: str = "RSA"
    paySign: str


class CreateAiOrderResponse(BaseModel):
    orderNo: str
    packageCode: str
    amountFen: int
    quotaAmount: int
    status: Literal["created", "paid", "failed", "closed"]
    paymentParams: AiOrderPaymentParams


class RedeemAdminCodeRequest(BaseModel):
    code: str = Field(min_length=1)


class RedeemAdminCodeResponse(BaseModel):
    hasFreeAccess: bool
    freeAccessExpiresAt: str


class CreateAdminCodesRequest(BaseModel):
    count: int = Field(default=1, ge=1, le=100)


class AdminCodeItem(BaseModel):
    code: str
    expiresAt: str


class CreateAdminCodesResponse(BaseModel):
    codes: list[AdminCodeItem]


class AccessKeySummaryRequest(BaseModel):
    code: str = Field(min_length=1)


class AccessKeySummary(BaseModel):
    code: str
    totalUses: int
    usedCount: int
    remainingUses: int
    status: str
    expiresAt: str | None = None
    canGenerateAi: bool


class CreateAccessKeysRequest(BaseModel):
    count: int = Field(default=1, ge=1, le=100)
    usesPerCode: int = Field(default=1, ge=1, le=10000)
    expiresAt: str | None = None


class AccessKeyItem(BaseModel):
    code: str
    totalUses: int
    usedCount: int
    remainingUses: int
    status: str
    expiresAt: str | None = None
    createdAt: str
    createdBy: str


class CreateAccessKeysResponse(BaseModel):
    keys: list[AccessKeyItem]
