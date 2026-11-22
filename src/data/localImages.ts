import heroKitchenImg from '../assets/images/hero_bespoke_kitchen_1794768608569.jpg';
import kitchenLShapeImg from '../assets/images/gallery_kitchen_lshape_1794768611388.jpg';
import wardrobeCashmereImg from '../assets/images/gallery_wardrobe_cashmere_1794768610442.jpg';
import livingTvUnitImg from '../assets/images/gallery_living_tv_unit_1794768611139.jpg';
import hallwayDresserImg from '../assets/images/gallery_hallway_dresser_1794768611436.jpg';

export const HERO_IMAGE_URL = heroKitchenImg;

const LOCAL_IMAGE_MAP: Record<string, string> = {
  '/src/assets/images/hero_bespoke_kitchen_1794768608569.jpg': heroKitchenImg,
  '/src/assets/images/gallery_kitchen_lshape_1794768611388.jpg': kitchenLShapeImg,
  '/src/assets/images/gallery_wardrobe_cashmere_1794768610442.jpg': wardrobeCashmereImg,
  '/src/assets/images/gallery_living_tv_unit_1794768611139.jpg': livingTvUnitImg,
  '/src/assets/images/gallery_hallway_dresser_1794768611436.jpg': hallwayDresserImg,
};

export function resolveGalleryImageUrl(url: string): string {
  return LOCAL_IMAGE_MAP[url] || url;
}
