import type { Pictogram, PictogramCategory, PictogramSet } from './pictogram-catalog';

export const PICTOGRAM_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const PICTOGRAM_SET_LIMIT = 250;
export const PICTOGRAM_IMAGE_BYTES = 512 * 1024;
export const PICTOGRAM_BUNDLE_BYTES = 16 * 1024 * 1024;

export type PictogramImageType = typeof PICTOGRAM_IMAGE_TYPES[number];
export type PictogramBundle = {
  version: 1;
  title: string;
  pictograms: {
    title: string;
    category: PictogramCategory;
    aliases: string[];
    image: { mime_type: PictogramImageType; base64: string };
  }[];
};

export interface ImportedPictograms {
  set: PictogramSet;
  pictograms: readonly Pictogram[];
}
