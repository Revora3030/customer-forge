import { describe, expect, it } from "vitest";
import { firstBuildPictureGap } from "./first-build-picture-gate";

describe("first-build picture gate", () => {
  it("stops a build with no owner photos and zero generated pictures", () => {
    expect(firstBuildPictureGap({ ownerPhotoCount: 0, generatedStatus: "blocked", keptPictures: 0 })).not.toBeNull();
  });
  it("passes when at least one picture was kept", () => {
    expect(firstBuildPictureGap({ ownerPhotoCount: 0, generatedStatus: "generated", keptPictures: 1 })).toBeNull();
  });
  it("passes when the owner supplied photos", () => {
    expect(firstBuildPictureGap({ ownerPhotoCount: 3, generatedStatus: "blocked", keptPictures: 0 })).toBeNull();
  });
});
