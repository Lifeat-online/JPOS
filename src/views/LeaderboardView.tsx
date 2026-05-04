import React from 'react';
import { Staff } from '../types';
import { Trophy, Medal, Timer, HandCoins } from 'lucide-react';

interface LeaderboardViewProps {
  staff: Staff[];
}

export function LeaderboardView({ staff }: LeaderboardViewProps) {
  const rankedStaff = [...staff].sort((a, b) => {
    const scoreA = (a.metrics?.totalTipsRounded || a.metrics?.totalTips || 0) - (a.metrics?.avgPrepTimeMs || a.metrics?.averagePrepTimeMs || 9_999_999);
    const scoreB = (b.metrics?.totalTipsRounded || b.metrics?.totalTips || 0) - (b.metrics?.avgPrepTimeMs || b.metrics?.averagePrepTimeMs || 9_999_999);
    return scoreB - scoreA;
  });

  const formatTime = (ms: number) => {
    if (!ms) return '-';
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-500" /> Staff Leaderboard
          </h2>
          <p className="text-slate-500 font-medium">Rankings, metrics, and gamification to keep the team motivated.</p>
        </div>

        {rankedStaff.length === 0 && (
          <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
            <Trophy className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No staff data yet</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rankedStaff.map((member, index) => (
            <div key={member.id} className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col group">
              <div className={`h-24 relative overflow-hidden ${index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-amber-700' : 'bg-primary'}`}>
                <div className="absolute top-4 right-4 text-white font-black text-2xl opacity-50">#{index + 1}</div>
              </div>

              <div className="px-6 pb-6 pt-0 relative z-10 -mt-10">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl border-4 border-white dark:border-slate-900 shadow-md flex items-center justify-center text-3xl font-black text-slate-400 mb-4">
                  {member.name.charAt(0).toUpperCase()}
                </div>

                <h3 className="text-xl font-black text-slate-800 dark:text-white mb-1">{member.name}</h3>
                <div className="text-xs font-bold uppercase tracking-widest text-primary mb-4">
                  {member.rank || 'Novice'}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-bold">
                      <Timer className="w-4 h-4" /> Avg Prep Time
                    </div>
                    <span className="font-black text-slate-700 dark:text-slate-200">
                      {formatTime(member.metrics?.avgPrepTimeMs || member.metrics?.averagePrepTimeMs || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-bold">
                      <HandCoins className="w-4 h-4" /> Total Tips
                    </div>
                    <span className="font-black text-slate-700 dark:text-slate-200">
                      R{member.metrics?.totalTipsRounded || member.metrics?.totalTips || 0}
                    </span>
                  </div>
                </div>

                {member.badges && member.badges.length > 0 && (
                  <div className="mt-6">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Badges</div>
                    <div className="flex flex-wrap gap-2">
                      {member.badges.map(badge => (
                        <div key={badge} className="px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-lg text-yellow-700 dark:text-yellow-500 text-xs font-bold flex items-center gap-1.5">
                          <Medal className="w-3 h-3" /> {badge}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
