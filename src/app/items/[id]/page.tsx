'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Shield, Sword } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { localizeItemName, localizeItemDesc } from '@/lib/i18n/catalog';

interface ItemDetails {
  id: string;
  name: string;
  description: string;
  type: string;
  level: number;
  stats: Record<string, number>;
  goldPrice: number;
  lore?: string; // Adicionaremos isso ao schema depois
}

export default function ItemDetailsPage() {
  const { locale, t } = useI18n();
  const { id } = useParams();
  const [item, setItem] = useState<ItemDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItemDetails = async () => {
      try {
        const response = await fetch(`/api/items/${id}`);
        if (response.ok) {
          const data = await response.json();
          setItem(data);
        }
      } catch (error) {
        console.error('Error fetching item details:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchItemDetails();
    }
  }, [id]);

  const getItemTypeColor = (type: string) => {
    const colors: { [key: string]: string } = {
      WEAPON: 'text-red-400',
      ARMOR: 'text-blue-400',
      HELMET: 'text-green-400',
      GLOVES: 'text-yellow-400',
      BOOTS: 'text-purple-400',
      RING: 'text-pink-400',
      NECKLACE: 'text-indigo-400',
      SHIELD: 'text-orange-400',
    };
    return colors[type] || 'text-gray-400';
  };

  const getItemTypeIcon = (type: string) => {
    switch (type) {
      case 'WEAPON':
        return <Sword className="w-6 h-6" />;
      case 'ARMOR':
      case 'HELMET':
      case 'GLOVES':
      case 'BOOTS':
      case 'SHIELD':
        return <Shield className="w-6 h-6" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">{t('Loading item details...')}</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">{t('Item not found')}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/inventory" className="inline-flex items-center text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5 mr-2" />
          {t('Back to inventory')}
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[4px] border border-[#46464c] bg-[#1e1e21]/95 p-6 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className={`text-3xl font-bold ${getItemTypeColor(item.type)} mb-2`}>
              {localizeItemName(item.name, locale)}
            </h1>
            <div className="flex items-center space-x-4 text-gray-400">
              <div className="flex items-center">
                {getItemTypeIcon(item.type)}
                <span className="ml-2">{item.type}</span>
              </div>
              <div>{t('Level')} {item.level}</div>
              <div>{item.goldPrice} {t('Gold')}</div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">{t('Description')}</h2>
            <p className="text-gray-300">{localizeItemDesc(item.name, item.description, locale)}</p>

            {item.lore && (
              <div className="mt-6">
                <h2 className="text-xl font-semibold mb-4">{t('Item Lore')}</h2>
                <p className="text-gray-300 italic">{item.lore}</p>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">{t('Attributes')}</h2>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(item.stats).map(([stat, value]) => (
                <div
                  key={stat}
                  className="rounded-[3px] border border-black/60 bg-[#19191c] p-4 flex justify-between items-center"
                >
                  <span className="text-gray-300 capitalize">{stat}</span>
                  <span className={value > 0 ? 'text-green-400' : 'text-red-400'}>
                    {value > 0 ? '+' : ''}{value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
