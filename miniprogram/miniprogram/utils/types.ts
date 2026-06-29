export type Rgb = [number, number, number];

export interface PaletteColor {
  code: string;
  name: string;
  rgb: Rgb;
  enabled: boolean;
}

export interface EmptyCell {
  x: number;
  y: number;
  empty: true;
}

export interface BeadCell {
  x: number;
  y: number;
  sourceRgb: Rgb;
  beadCode: string;
  beadName: string;
  beadRgb: Rgb;
  distance: number;
}

export interface RawColorCell {
  x: number;
  y: number;
  sourceRgb: Rgb;
}

export type PatternCell = EmptyCell | BeadCell | RawColorCell;

export interface BeadUsage {
  beadCode: string;
  beadName: string;
  beadRgb: Rgb;
  count: number;
}

export interface PatternResult {
  widthCells: number;
  heightCells: number;
  paletteVersion: string;
  cells: PatternCell[][];
  usage: BeadUsage[];
  generatedAt: string;
  rleRows?: string[] | null;
}

export interface GenerationStatus {
  generationId: string;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  result?: PatternResult;
}

export interface AiImageStatus {
  aiImageId: string;
  status: "pending" | "processing" | "completed" | "failed";
  imageUrl?: string | null;
  error?: string | null;
}

export interface PatternSizeRecommendation {
  widthCells: number;
  heightCells: number;
  sourceWidth: number;
  sourceHeight: number;
  recommendedColors: number;
  detectedBlockWidth?: number | null;
  detectedBlockHeight?: number | null;
  confidence: number;
  reason: string;
}

export interface PatternDebugAnalysis {
  sourceWidth: number;
  sourceHeight: number;
  detectedBlockWidth?: number | null;
  detectedBlockHeight?: number | null;
  detectedGridWidth: number;
  detectedGridHeight: number;
  detectedPixelCount: number;
  compressedGridWidth: number;
  compressedGridHeight: number;
  compressedPixelCount: number;
  originalPreviewDataUrl: string;
  compressedPreviewDataUrl: string;
}

export function isEmptyCell(cell: PatternCell): cell is EmptyCell {
  return "empty" in cell && cell.empty === true;
}

export function isBeadCell(cell: PatternCell): cell is BeadCell {
  return "beadRgb" in cell;
}

export interface UserSummary {
  openid: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface WechatLoginResponse {
  sessionToken: string;
  expiresAt: string;
  userSummary: UserSummary;
}

export interface AiPackageOffer {
  code: string;
  title: string;
  amountFen: number;
  quotaAmount: number;
}

export interface AiAccessSummary {
  remainingQuota: number;
  hasFreeAccess: boolean;
  freeAccessExpiresAt?: string | null;
  canGenerateAi: boolean;
  activePackageOffers: AiPackageOffer[];
}

export interface AiOrderPaymentParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
}

export interface CreateAiOrderResponse {
  orderNo: string;
  packageCode: string;
  amountFen: number;
  quotaAmount: number;
  status: "created" | "paid" | "failed" | "closed";
  paymentParams: AiOrderPaymentParams;
}

export interface RedeemAdminCodeResponse {
  hasFreeAccess: boolean;
  freeAccessExpiresAt: string;
}

export interface AccessKeySummary {
  code: string;
  totalUses: number;
  usedCount: number;
  remainingUses: number;
  status: string;
  expiresAt?: string | null;
  canGenerateAi: boolean;
}

export interface AdminLoginResponse {
  adminToken: string;
  expiresAt: string;
}

export interface AccessKeyItem {
  code: string;
  totalUses: number;
  usedCount: number;
  remainingUses: number;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
  createdBy: string;
}

export interface CreateAccessKeysResponse {
  keys: AccessKeyItem[];
}
