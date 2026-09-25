import bannerImg from "./banner.jpg";
import classGunnerImg from "./class_gunner.jpg";
import classMageImg from "./class_mage.jpg";
import classPaladinImg from "./class_paladin.jpg";
import classSwordsmanImg from "./class_swordsman.jpg";
import seedCoreImg from "./seed_core.jpg";

export const ASSETS = {
  banner: bannerImg,
  seedCore: seedCoreImg,
  classes: {
    swordsman: classSwordsmanImg,
    mage: classMageImg,
    gunner: classGunnerImg,
    paladin: classPaladinImg,
  },
} as const;

export type CharacterClassId = keyof typeof ASSETS.classes;
