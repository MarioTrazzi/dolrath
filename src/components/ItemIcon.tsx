'use client';

import { ItemType } from '@prisma/client';
import { 
  Sword,
  Axe,
  Webhook as Dagger,
  Wallpaper as Staff,
  Target,
  Shield, 
  Footprints as Boot,
  CircleDot as Ring,
  ShieldCheck as ArmorPlating,
  Gem 
} from 'lucide-react';

export enum ItemType {
  SWORD = 'SWORD',
  AXE = 'AXE',
  DAGGER = 'DAGGER',
  STAFF = 'STAFF',
  BOW = 'BOW',
  LIGHT_ARMOR = 'LIGHT_ARMOR',
  MEDIUM_ARMOR = 'MEDIUM_ARMOR',
  HEAVY_ARMOR = 'HEAVY_ARMOR',
  LIGHT_HELMET = 'LIGHT_HELMET',
  MEDIUM_HELMET = 'MEDIUM_HELMET',
  HEAVY_HELMET = 'HEAVY_HELMET',
  LIGHT_GLOVES = 'LIGHT_GLOVES',
  MEDIUM_GLOVES = 'MEDIUM_GLOVES',
  HEAVY_GLOVES = 'HEAVY_GLOVES',
  LIGHT_BOOTS = 'LIGHT_BOOTS',
  MEDIUM_BOOTS = 'MEDIUM_BOOTS',
  HEAVY_BOOTS = 'HEAVY_BOOTS',
  RING = 'RING',
  NECKLACE = 'NECKLACE',
  SHIELD = 'SHIELD'
}

interface ItemIconProps {
  type: ItemType;
  size?: number;
  className?: string;
}

export default function ItemIcon({ type, size = 24, className = '' }: ItemIconProps) {
  const iconProps = {
    size,
    className: `${className}`
  };

  switch (type) {
    case ItemType.SWORD:
      return <Sword {...iconProps} />;
    case ItemType.AXE:
      return <Axe {...iconProps} />;
    case ItemType.DAGGER:
      return <Dagger {...iconProps} />;
    case ItemType.STAFF:
      return <Staff {...iconProps} />;
    case ItemType.BOW:
      return <Target {...iconProps} />;
    case ItemType.LIGHT_ARMOR:
    case ItemType.MEDIUM_ARMOR:
    case ItemType.HEAVY_ARMOR:
      return <ArmorPlating {...iconProps} />;
    case ItemType.LIGHT_HELMET:
    case ItemType.MEDIUM_HELMET:
    case ItemType.HEAVY_HELMET:
      return <Shield {...iconProps} />;
    case ItemType.LIGHT_BOOTS:
    case ItemType.MEDIUM_BOOTS:
    case ItemType.HEAVY_BOOTS:
    case ItemType.LIGHT_GLOVES:
    case ItemType.MEDIUM_GLOVES:
    case ItemType.HEAVY_GLOVES:
      return <Boot {...iconProps} />;
    case ItemType.RING:
    case ItemType.NECKLACE:
      return <Ring {...iconProps} />;
    case ItemType.SHIELD:
      return <Shield {...iconProps} />;
    default:
      return <Gem {...iconProps} />;
  }
}