export interface PatternSizeWarningInput {
  widthCells: number;
  heightCells: number;
  recommendedWidthCells?: number;
  recommendedHeightCells?: number;
}

export function buildPatternSizeWarning(input: PatternSizeWarningInput): string {
  const minSide = Math.min(input.widthCells, input.heightCells);
  const recommendedWidth = input.recommendedWidthCells || 0;
  const recommendedHeight = input.recommendedHeightCells || 0;
  const hasRecommendation = recommendedWidth > 0 && recommendedHeight > 0;

  if (minSide <= 32) {
    const suggestedSize = hasRecommendation ? `${recommendedWidth} x ${recommendedHeight} 或更大` : "更大";
    return `当前尺寸较小，细节、边界或小图案可能丢失；建议尝试 ${suggestedSize}尺寸。`;
  }

  if (
    hasRecommendation &&
    (input.widthCells < recommendedWidth * 0.75 || input.heightCells < recommendedHeight * 0.75)
  ) {
    return `当前尺寸低于推荐尺寸较多，细节、边界或小图案可能丢失；建议尝试 ${recommendedWidth} x ${recommendedHeight}。`;
  }

  return "";
}
