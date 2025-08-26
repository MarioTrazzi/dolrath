'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface Item {
  id: string;
  name: string;
  description: string;
  type: string;
  level: number;
  stats: any;
  goldPrice: number;
}

interface UserInventory {
  id: string;
  itemId: string;
  quantity: number;
  item: Item;
}

export default function Inventory({ showTitle = true, compact = false }) {
  const { data: session } = useSession();
  const [inventory, setInventory] = useState<UserInventory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        const response = await fetch('/api/store/inventory');
        if (response.ok) {
          const data = await response.json();
          setInventory(data);
        }
      } catch (error) {
        console.error('Error fetching inventory:', error);
      } finally {
        setLoading(false);
      }
    };

    if (session) {
      fetchInventory();
    }
  }, [session]);

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

  if (loading) {
    return <div className="text-center">Carregando inventário...</div>;
  }

  return (
    <div className={`${compact ? 'p-2' : 'p-4'}`}>
      {showTitle && (
        <h2 className="text-2xl font-bold mb-4">Inventário</h2>
      )}
      
      {inventory.length === 0 ? (
        <div className="text-center text-gray-500">
          Seu inventário está vazio
        </div>
      ) : (
        <div className={`grid ${compact ? 'grid-cols-2 gap-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
          {inventory.map(({ item, quantity }) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-gray-800 rounded-lg p-4 shadow-lg"
            >
              <div className="flex justify-between items-start mb-2">
                <Link href={`/items/${item.id}`}>
                  <h3 className={`font-semibold ${getItemTypeColor(item.type)} hover:underline cursor-pointer`}>
                    {item.name}
                  </h3>
                </Link>
                <span className="text-sm text-gray-400">x{quantity}</span>
              </div>
              {!compact && (
                <>
                  <p className="text-sm text-gray-400 mb-2">{item.description}</p>
                  <div className="text-sm">
                    <span className="text-gray-400">Nível: </span>
                    <span className="text-white">{item.level}</span>
                  </div>
                </>
              )}
              <div className="mt-2 text-sm grid grid-cols-2 gap-2">
                {Object.entries(item.stats).map(([stat, value]) => (
                  <div key={stat} className="text-gray-300">
                    {stat}: {value}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
