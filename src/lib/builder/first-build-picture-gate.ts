/**
 * Finish-line picture rule for first builds: a new site never completes with
 * zero pictures when the owner supplied none. Pure so it can be unit tested.
 */
export type PictureGateInput = {
  ownerPhotoCount: number;
  generatedStatus: string;
  keptPictures: number;
};

export function firstBuildPictureGap(input: PictureGateInput): string | null {
  if (input.ownerPhotoCount > 0 || input.generatedStatus === "owner_photos") return null;
  if (input.keptPictures > 0) return null;
  return "no pictures were made for this site";
}
