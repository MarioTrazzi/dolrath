import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Clock, 
  Sword, 
  Shield, 
  Star, 
  Coins, 
  Package, 
  TrendingUp, 
  Award,
  ShoppingCart,
  Gift,
  Zap,
  Plus
} from 'lucide-react';

interface HistoryEntry {
  id: string;
  activityType: string;
  description: string;
  details?: any;
  item?: {
    id: string;
    name: string;
    type: string;
    goldPrice: number;
  };
  goldAmount?: number;
  xpAmount?: number;
  oldLevel?: number;
  newLevel?: number;
  createdAt: string;
}

interface CharacterHistoryProps {
  characterId: string;
}

const getActivityIcon = (activityType: string) => {
  switch (activityType) {
    case 'ITEM_PURCHASE':
      return <ShoppingCart className="w-4 h-4 text-blue-500" />;
    case 'ITEM_GAINED':
      return <Gift className="w-4 h-4 text-green-500" />;
    case 'ITEM_SOLD':
      return <Coins className="w-4 h-4 text-yellow-500" />;
    case 'ITEM_CONSUMED':
      return <Zap className="w-4 h-4 text-purple-500" />;
    case 'ITEM_EQUIPPED':
      return <Sword className="w-4 h-4 text-orange-500" />;
    case 'ITEM_UNEQUIPPED':
      return <Shield className="w-4 h-4 text-gray-500" />;
    case 'XP_GAINED':
      return <Star className="w-4 h-4 text-cyan-500" />;
    case 'LEVEL_UP':
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    case 'GOLD_GAINED':
      return <Coins className="w-4 h-4 text-yellow-600" />;
    case 'GOLD_SPENT':
      return <Coins className="w-4 h-4 text-red-500" />;
    case 'DUNGEON_COMPLETED':
      return <Award className="w-4 h-4 text-purple-600" />;
    case 'CHARACTER_CREATED':
      return <Star className="w-4 h-4 text-rainbow" />;
    case 'ATTRIBUTE_DISTRIBUTED':
      return <TrendingUp className="w-4 h-4 text-blue-600" />;
    case 'INVENTORY_EXPANDED':
      return <Package className="w-4 h-4 text-indigo-500" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
};

const getActivityColor = (activityType: string) => {
  switch (activityType) {
    case 'ITEM_PURCHASE':
    case 'GOLD_SPENT':
      return 'border-l-blue-500 bg-blue-500/5';
    case 'ITEM_GAINED':
    case 'GOLD_GAINED':
      return 'border-l-green-500 bg-green-500/5';
    case 'LEVEL_UP':
      return 'border-l-green-600 bg-green-600/10';
    case 'XP_GAINED':
      return 'border-l-cyan-500 bg-cyan-500/5';
    case 'ITEM_CONSUMED':
      return 'border-l-purple-500 bg-purple-500/5';
    case 'ITEM_EQUIPPED':
      return 'border-l-orange-500 bg-orange-500/5';
    case 'DUNGEON_COMPLETED':
      return 'border-l-purple-600 bg-purple-600/10';
    case 'CHARACTER_CREATED':
      return 'border-l-rainbow bg-gradient-to-r from-purple-500/10 to-pink-500/10';
    default:
      return 'border-l-gray-400 bg-gray-400/5';
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return 'Agora mesmo';
  if (diffInMinutes < 60) return `${diffInMinutes}m atrás`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h atrás`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d atrás`;
  
  return date.toLocaleDateString('pt-BR');
};

export default function CharacterHistory({ characterId }: CharacterHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/character/${characterId}/history`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data);
        } else {
          setError('Erro ao carregar histórico');
        }
      } catch (err) {
        setError('Erro ao carregar histórico');
        console.error('Error fetching history:', err);
      } finally {
        setLoading(false);
      }
    };

    if (characterId) {
      fetchHistory();
    }
  }, [characterId]);

  if (loading) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Histórico
        </h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-surface/30 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Histórico
        </h3>
        <div className="text-red-400 text-center py-4">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5" />
        Histórico
      </h3>
      
      {history.length === 0 ? (
        <div className="text-text-secondary text-center py-8">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhuma atividade registrada ainda.</p>
          <p className="text-sm">Comece jogando para ver seu histórico aqui!</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {history.map((entry, index) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`p-3 rounded-lg border-l-4 ${getActivityColor(entry.activityType)} hover:bg-surface/20 transition-colors`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getActivityIcon(entry.activityType)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-medium">
                    {entry.description}
                  </p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-text-secondary text-xs">
                      {formatDate(entry.createdAt)}
                    </span>
                    {entry.goldAmount && (
                      <span className="text-yellow-500 text-xs flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        {entry.goldAmount}
                      </span>
                    )}
                    {entry.xpAmount && (
                      <span className="text-cyan-500 text-xs flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        {entry.xpAmount} XP
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
