import { Video, FileText, HelpCircle, Play } from 'lucide-react';
import { tutorials } from '../../data/mockData';

const iconMap: Record<string, typeof Video> = {
  video: Video,
  pdf: FileText,
  faq: HelpCircle,
};

const colorMap: Record<string, string> = {
  video: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  pdf: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600',
  faq: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
};

export default function Tutorials() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Tutoriais</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Aprenda a usar todas as ferramentas
        </p>
      </div>

      {/* Tutorials grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tutorials.map((tutorial) => {
          const Icon = iconMap[tutorial.type];
          return (
            <div
              key={tutorial.id}
              className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-gray-100 dark:bg-navy-700 relative flex items-center justify-center">
                {tutorial.type === 'video' ? (
                  <button className="w-14 h-14 bg-white/90 dark:bg-navy-800/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 text-navy-900 dark:text-white ml-1" />
                  </button>
                ) : (
                  <div className={`p-4 rounded-2xl ${colorMap[tutorial.type]}`}>
                    <Icon className="w-8 h-8" />
                  </div>
                )}
                {tutorial.duration && (
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded">
                    {tutorial.duration}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-lg ${colorMap[tutorial.type]}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-slate-400 capitalize">
                    {tutorial.type === 'video' ? 'Vídeo' : tutorial.type === 'pdf' ? 'PDF' : 'FAQ'}
                  </span>
                </div>
                <h3 className="text-navy-900 dark:text-white font-medium text-sm">
                  {tutorial.title}
                </h3>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
