export interface PatternSizeOption {
  label: string;
  widthCells?: number;
  heightCells?: number;
  custom?: boolean;
}

export const PATTERN_SIZE_OPTIONS: PatternSizeOption[] = [
  { label: "52 x 52", widthCells: 52, heightCells: 52 },
  { label: "78 x 78", widthCells: 78, heightCells: 78 },
  { label: "104 x 104", widthCells: 104, heightCells: 104 },
  { label: "自定义", custom: true }
];

export function applyPatternSizeOption(
  index: number,
  currentWidthCells: number,
  currentHeightCells: number
): { widthCells: number; heightCells: number; isCustomSize: boolean } {
  const option = PATTERN_SIZE_OPTIONS[index] || PATTERN_SIZE_OPTIONS[0];
  if (option.custom) {
    return {
      widthCells: currentWidthCells,
      heightCells: currentHeightCells,
      isCustomSize: true
    };
  }

  return {
    widthCells: option.widthCells || currentWidthCells,
    heightCells: option.heightCells || currentHeightCells,
    isCustomSize: false
  };
}