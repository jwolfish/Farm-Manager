export type RGB = [number, number, number];

export const GREEN_DARK: RGB = [27, 94, 32];
export const GREEN_HEADER: RGB = [46, 125, 50];
export const GREEN_ROW_ALT: RGB = [232, 245, 233];
export const GREEN_ROW_HEADER: RGB = [200, 230, 201];
export const GRAY_LABEL: RGB = [100, 116, 139];
export const DARK: RGB = [17, 24, 39];
export const WHITE: RGB = [255, 255, 255];

export const CROP_LABELS: Record<string, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

export const CROP_FILL: Record<string, RGB> = {
  corn:     [254, 243, 199],
  soybeans: [220, 252, 231],
  wheat:    [255, 237, 213],
};

export const CROP_TEXT: Record<string, RGB> = {
  corn:     [120, 60, 0],
  soybeans: [20, 100, 40],
  wheat:    [130, 60, 0],
};
