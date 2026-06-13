export const MIN_LABEL_CELL_SIZE = 12;

export function shouldDrawCellLabel(cellSize: number, forExport: boolean): boolean {
  return forExport || cellSize >= MIN_LABEL_CELL_SIZE;
}
